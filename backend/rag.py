"""
RAG orchestration: chunking, local embeddings, FAISS retrieval, Ollama generation.
Only retrieved chunks are sent to the LLM; one analysis call per upload, one per chat question.
"""

from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from embeddings import (
    document_embedding_cache_key,
    embed_query,
    embed_texts,
    save_cached_document_embeddings,
    try_load_cached_document_embeddings,
)
from ollama_llm import OllamaServiceError, ollama_json_generate, ollama_text_generate
from retrieval import ChunkStore, build_chunk_store

CHUNK_SIZE = 2000   # ~500 tokens — matches PRD FR-3 (500–1000 token chunks)
CHUNK_OVERLAP = 300  # 15% overlap — within PRD FR-3 (10–20%)
TOP_K = 3
# Upload analysis: keep total context under Groq free-tier 12K TPM limit.
# 6 chunks × ~500 tokens + ~600 prompt tokens + ~2500 response = ~6100 tokens total.
ANALYSIS_MAX_CHUNKS = int(os.environ.get("ANALYSIS_MAX_CHUNKS", "6"))
ANALYSIS_K_PER_QUERY = int(os.environ.get("ANALYSIS_K_PER_QUERY", "4"))
# Chat: more chunks + head of lease so answers are not starved of context.
CHAT_TOP_K = int(os.environ.get("CHAT_TOP_K", "8"))
CHAT_HEAD_CHUNKS = int(os.environ.get("CHAT_HEAD_CHUNKS", "2"))

GROUNDING_SYSTEM = """You answer ONLY using the provided contract excerpts.
If information is not found in the excerpts, you MUST say exactly: Not found in contract.
Do not invent facts, amounts, or dates. Do not use outside knowledge.
Always end your answer with a citation in the format: [Source: Page X] — use the [Page N] markers in the excerpts."""

EXTRACTION_SYSTEM = """You extract structured information ONLY from the provided contract excerpts.
If a field is not clearly stated in the excerpts, use exactly: Not Found in Contract
Never use 0, €0, or placeholder amounts as guesses.
Never infer dates or amounts not present in the excerpts.
Return valid JSON only.
For every extracted value, also return a verbatim source quote (the exact sentence or phrase from the excerpts that contains this value, including its [Page N] marker).
Short dashboard label fields (notice_period, renewal_terms, late_payment_penalties) must be concise — max ~120 characters."""

COMBINED_RETRIEVAL_QUERY = (
    "rental residential lease tenancy landlord tenant rent deposit Kaution Miete "
    "commencement start date end date expiry Mietbeginn notice Kündigung termination "
    "renewal auto-renewal late payment penalty fee interest default "
    "risks obligations conflicts summary recommendation"
)

MEGA_ANALYSIS_USER_PROMPT = """You are given excerpts from ONE rental contract. Extract ALL fields below from these excerpts ONLY.

Return a single JSON object with EXACTLY this structure (no extra keys):
{
  "is_rental": boolean,
  "validation_reason": string,

  "monthly_rent": string,
  "monthly_rent_quote": string,

  "deposit": string,
  "deposit_quote": string,

  "start_date": string,
  "start_date_quote": string,

  "end_date": string,
  "end_date_quote": string,

  "notice_period": string,
  "notice_period_quote": string,

  "renewal_terms": string,
  "renewal_terms_quote": string,

  "late_payment_penalties": string,
  "late_payment_penalties_quote": string,

  "risks": [{"risk_type": string, "severity": "LOW"|"MEDIUM"|"HIGH", "clause_reference": string, "explanation": string, "why_it_matters": string}],
  "conflicts": [{"clause_a": string, "clause_b": string, "topic": string, "explanation": string}],
  "final_summary": string,
  "recommendation": "SAFE"|"CAUTION"|"HIGH_RISK"
}

Field rules:
- is_rental: true if excerpts indicate a residential rental / tenancy; false only if clearly not.
- validation_reason: one short sentence.
- monthly_rent: the monthly rent amount exactly as written (e.g. "€1,250/month"). Not Found in Contract if absent.
- monthly_rent_quote: the verbatim sentence from the excerpts containing the rent figure, including [Page N] marker.
- deposit: security deposit amount exactly as written. Not Found in Contract if absent.
- deposit_quote: verbatim sentence containing the deposit figure, including [Page N] marker.
- start_date: lease commencement date exactly as written. Not Found in Contract if absent.
- start_date_quote: verbatim sentence containing the start date, including [Page N] marker.
- end_date: lease expiry / end date exactly as written. If open-ended, write "Open-ended tenancy". Not Found in Contract only if truly absent.
- end_date_quote: verbatim sentence containing the end date or open-ended clause, including [Page N] marker.
- notice_period: ONE concise line (max 120 chars). E.g. "3 months written notice" or "3 / 6 / 9 months by tenancy length". No statute citations.
- notice_period_quote: verbatim sentence containing the notice requirement, including [Page N] marker.
- renewal_terms: ONE concise line (max 120 chars). E.g. "Auto-renews for 12 months unless notice given" or "No automatic renewal". Not Found in Contract if absent.
- renewal_terms_quote: verbatim sentence containing the renewal clause, including [Page N] marker.
- late_payment_penalties: ONE concise line (max 120 chars). E.g. "5% interest after 5 days late" or "€50 fee per missed payment". Not Found in Contract if absent.
- late_payment_penalties_quote: verbatim sentence containing the late payment clause, including [Page N] marker.
- risks: tenant-facing risks only. ALWAYS flag if present: unusual termination penalties, automatic renewal clauses, rent escalation clauses, restricted use clauses. Use [] if none.
- conflicts: [] if none evident.
- final_summary: 2–4 sentences, plain English, from excerpts only.
- recommendation: SAFE, CAUTION, or HIGH_RISK based solely on excerpts.
- For any _quote field where the value is Not Found in Contract, set the quote to "" (empty string).
- Read every excerpt carefully before deciding a field is missing."""

RETRIEVAL_QUERIES_FOR_ANALYSIS = [
    COMBINED_RETRIEVAL_QUERY,
    "monthly rent Miete Kaltmiete warmmiete Bruttomiete Euro € EUR amount per month",
    "deposit Kaution security bond refundable amount weeks months rent",
    "lease start commencement date Mietbeginn move-in effective date",
    "lease end expiry date termination date fixed term duration Laufzeit",
    "notice period Kündigungsfrist written notice months weeks termination",
    "renewal auto-renewal automatic extension clause Verlängerung",
    "late payment penalty interest fee default overdue rent arrears",
]

_sessions: dict[str, "SessionState"] = {}


@dataclass
class SessionState:
    session_id: str
    raw_text: str
    chunks: list[str]
    store: ChunkStore
    _retrieval_cache: dict[str, list[str]] = field(default_factory=dict)


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping character chunks."""
    if size <= overlap:
        raise ValueError("size must be greater than overlap")
    chunks: list[str] = []
    i = 0
    n = len(text)
    step = size - overlap
    while i < n:
        chunk = text[i : i + size]
        if chunk.strip():
            chunks.append(chunk.strip())
        i += step
    return chunks if chunks else ([text.strip()] if text.strip() else [])


def _format_context(chunks: list[str]) -> str:
    parts = []
    for i, c in enumerate(chunks, start=1):
        parts.append(f"[Excerpt {i}]\n{c}")
    return "\n\n".join(parts)


def _prompt_with_context(user_prompt: str, context_chunks: list[str]) -> str:
    ctx = _format_context(context_chunks)
    return f"Contract excerpts (only source of truth):\n{ctx}\n\n{user_prompt}"


def llm_json_from_context(
    system_instruction: str,
    user_prompt: str,
    context_chunks: list[str],
    *,
    max_chunks: int | None = None,
) -> dict[str, Any]:
    cap = max_chunks if max_chunks is not None else TOP_K
    cap = max(1, min(cap, len(context_chunks) or 1))
    trimmed = context_chunks[:cap]
    full_prompt = _prompt_with_context(user_prompt, trimmed)
    return ollama_json_generate(system_instruction, full_prompt, temperature=0.1)


def llm_text_from_context(
    system_instruction: str,
    user_prompt: str,
    context_chunks: list[str],
    *,
    max_chunks: int | None = None,
) -> str:
    cap = max_chunks if max_chunks is not None else min(TOP_K, 3)
    cap = max(1, min(cap, len(context_chunks) or 1))
    trimmed = context_chunks[:cap]
    full_prompt = _prompt_with_context(user_prompt, trimmed)
    return ollama_text_generate(system_instruction, full_prompt, temperature=0.2)


def _retrieval_cache_key(query: str) -> str:
    return query.strip().lower()[:2000]


def retrieve_chunks(session: SessionState, query: str, k: int = TOP_K) -> list[str]:
    """Embed query once per distinct question text; reuse chunk list for identical queries."""
    k = max(0, min(k, 12, len(session.chunks)))
    key = _retrieval_cache_key(query)
    if key in session._retrieval_cache:
        return session._retrieval_cache[key][:k]
    q_emb = embed_query(query)
    chunks = session.store.search(q_emb, k=k)
    session._retrieval_cache[key] = chunks
    return chunks


def build_session_from_text(contract_text: str) -> SessionState:
    """Chunk, embed documents (local + cache), build FAISS index."""
    chunks = chunk_text(contract_text)
    if not chunks:
        raise ValueError("No text could be chunked from the document")
    cache_key = document_embedding_cache_key(contract_text, CHUNK_SIZE, CHUNK_OVERLAP)
    doc_embeddings = try_load_cached_document_embeddings(cache_key, len(chunks))
    if doc_embeddings is None:
        doc_embeddings = embed_texts(chunks, task_type="retrieval_document")
        save_cached_document_embeddings(cache_key, doc_embeddings)
    store = build_chunk_store(chunks, doc_embeddings)
    sid = str(uuid.uuid4())
    return SessionState(session_id=sid, raw_text=contract_text, chunks=chunks, store=store)


def commit_session(session: SessionState) -> None:
    _sessions[session.session_id] = session


def get_session(session_id: str) -> SessionState | None:
    return _sessions.get(session_id)


def heuristic_rental_document(text: str) -> bool:
    low = text.lower()[:40000]
    leaseish = any(
        w in low
        for w in (
            "lease",
            "tenancy",
            "rental agreement",
            "tenancy agreement",
            "lessee",
            "lessor",
            "landlord",
            "tenant",
        )
    )
    moneyish = any(w in low for w in ("rent", "deposit", "monthly", "premises", "dwelling", "apartment"))
    return leaseish and moneyish


def _norm_contract_field(raw: Any) -> str:
    if raw is None:
        return "Not Found in Contract"
    s = str(raw).strip()
    if not s:
        return "Not Found in Contract"
    low = s.lower()
    if low in ("not found in contract", "not found", "n/a", "na", "none", "unknown", "-", "—"):
        return "Not Found in Contract"
    if low.startswith("not found in contract"):
        return "Not Found in Contract"
    return s


def _truncate_for_dashboard(text: str, max_len: int = 320) -> str:
    t = (text or "").strip()
    if len(t) <= max_len:
        return t
    cut = t[:max_len].rstrip()
    for sep in (". ", ".\n", "; ", "\n"):
        idx = cut.rfind(sep)
        if idx > max_len // 3:
            return (cut[: idx + 1].strip() + " …")[: max_len + 5]
    sp = cut.rfind(" ")
    if sp > max_len // 3:
        return cut[:sp].rstrip(",;") + " …"
    return cut.rstrip() + " …"


def _strip_statute_noise(text: str) -> str:
    """Remove German-style statute parentheticals and bare §... BGB from short UI strings."""
    t = (text or "").strip()
    if not t:
        return t
    t = re.sub(r"\s*\([^)]*§\s*\d+[^)]*\)\s*", " ", t)
    t = re.sub(r"\s*§\s*\d+[a-zA-Z]*\s*,?\s*BGB\b\.?", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*§\s*\d+[a-zA-Z]*\b\.?", "", t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    return t


def _compact_lease_duration_display(text: str, max_len: int = 96) -> str:
    """One line for snapshot card: first clear phrase, no legal essay."""
    t = _strip_statute_noise(text)
    if len(t) <= max_len:
        return t
    for sep in ("; ", ". ", ", and ", "\n"):
        idx = t.find(sep)
        if 12 <= idx <= max_len + 50:
            return _truncate_for_dashboard(t[: idx].strip(), max_len)
    return _truncate_for_dashboard(t, max_len)


def _simplify_termination_mirror_clauses(text: str) -> str:
    """If two ;-separated clauses give the same months' notice for landlord and tenant, compress to one line."""
    t = (text or "").strip()
    if ";" not in t:
        return t
    parts = [p.strip() for p in t.split(";") if p.strip()]
    if len(parts) != 2:
        return t
    m1 = re.search(r"(\d+)\s*(?:month|months|monate|monaten)\b", parts[0], re.I)
    m2 = re.search(r"(\d+)\s*(?:month|months|monate|monaten)\b", parts[1], re.I)
    if not (m1 and m2) or m1.group(1) != m2.group(1):
        return t
    n = m1.group(1)
    written = bool(re.search(r"\bwritten\b", t, re.I))
    out = f"{n}-month ordinary notice for landlord and tenant."
    if written:
        out += " Written notice required."
    return out


def _compact_termination_display(text: str, max_len: int = 160) -> str:
    """Short tenant-facing summary; citations stripped then trimmed."""
    t = _strip_statute_noise(text)
    t = _simplify_termination_mirror_clauses(t)
    return _truncate_for_dashboard(t, max_len)


def _compact_notice_period_display(text: str, max_len: int = 100) -> str:
    """Tiered statutory/contract notice -> one short line; else truncate."""
    t = _strip_statute_noise(text)
    if not t:
        return t
    parts = [p.strip() for p in re.split(r"\s*;\s*", t) if p.strip()]
    if len(parts) >= 2:
        nums: list[str] = []
        for p in parts:
            m = re.search(r"(\d+)\s*(?:month|months|monate|monaten)\b", p, re.I)
            if m:
                nums.append(m.group(1))
        if len(nums) >= 2:
            return _truncate_for_dashboard(
                " / ".join(nums) + " months' notice (depends on tenancy length)",
                max_len,
            )
    return _truncate_for_dashboard(t, max_len)


def _compact_utilities_display(text: str, max_len: int = 100) -> str:
    """One short utilities line for snapshot cards."""
    t = _strip_statute_noise(text)
    if not t:
        return t
    if len(t) <= max_len:
        return t
    for sep in (". ", "; ", "\n"):
        idx = t.find(sep)
        if 15 <= idx <= max_len + 40:
            return _truncate_for_dashboard(t[:idx].strip(), max_len)
    return _truncate_for_dashboard(t, max_len)


def build_data_quality(session: SessionState) -> dict[str, Any]:
    text = session.raw_text
    issues = []
    if len(text) < 800:
        issues.append("Short extracted text — document may be scanned or sparse.")
    if re.search(r"[^\x00-\x7F]", text):
        issues.append("Non-ASCII characters present — verify extraction accuracy.")
    return {
        "ocr_confidence": "HIGH" if len(text) > 1500 else "MEDIUM",
        "extraction_confidence": "HIGH" if len(session.chunks) > 3 else "MEDIUM",
        "issues_detected": issues or ["No major structural issues flagged."],
    }


def analysis_context_chunks(session: SessionState) -> list[str]:
    """First chunks of the PDF plus several targeted retrievals (deduped) for dashboard extraction."""
    max_total = max(3, min(ANALYSIS_MAX_CHUNKS, len(session.chunks)))
    k_per = max(1, min(ANALYSIS_K_PER_QUERY, len(session.chunks)))
    seen: set[str] = set()
    out: list[str] = []
    for c in session.chunks[: min(3, len(session.chunks))]:
        if c not in seen:
            seen.add(c)
            out.append(c)
    for q in RETRIEVAL_QUERIES_FOR_ANALYSIS:
        for c in retrieve_chunks(session, q, k=k_per):
            if c not in seen:
                seen.add(c)
                out.append(c)
                if len(out) >= max_total:
                    return out
    return out[:max_total]


def validate_and_analyze_upload(session: SessionState) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """
    Merged retrieval (head + several queries, up to ANALYSIS_MAX_CHUNKS) + one Ollama JSON completion.
    Returns (validation_dict, full_analysis_dict_or_none_if_rejected).
    """
    chunks = analysis_context_chunks(session)
    if not chunks:
        chunks = session.chunks[: min(TOP_K, len(session.chunks))]

    last_err: str | None = None
    data: dict[str, Any] = {}
    try:
        if chunks:
            data = llm_json_from_context(
                EXTRACTION_SYSTEM,
                MEGA_ANALYSIS_USER_PROMPT,
                chunks,
                max_chunks=len(chunks),
            )
        else:
            last_err = "No chunks available for analysis."
    except OllamaServiceError:
        raise
    except Exception as exc:
        last_err = str(exc)

    is_rental = data.get("is_rental")
    reason = str(data.get("validation_reason") or "").strip() or (last_err or "")

    if isinstance(is_rental, bool) and not is_rental:
        if heuristic_rental_document(session.raw_text):
            is_rental = True
            reason = (
                "Rental agreement indicators found in document text (fallback after model returned false)."
            )
        else:
            return (
                {
                    "is_rental": False,
                    "reason": reason or "Could not confirm this is a rental agreement from the excerpts.",
                },
                None,
            )

    if not isinstance(is_rental, bool):
        if heuristic_rental_document(session.raw_text):
            is_rental = True
            reason = reason or "Rental agreement indicators found in document text."
        else:
            return (
                {
                    "is_rental": False,
                    "reason": last_err or "Could not determine document type from excerpts.",
                },
                None,
            )

    def _norm_quote(raw: Any) -> str:
        s = str(raw or "").strip()
        return s if s and s.lower() not in ("not found in contract", "not found", "n/a", "none", "") else ""

    fields = {
        "monthly_rent": _norm_contract_field(data.get("monthly_rent")),
        "deposit": _norm_contract_field(data.get("deposit")),
        "start_date": _norm_contract_field(data.get("start_date")),
        "end_date": _norm_contract_field(data.get("end_date")),
        "notice_period": _norm_contract_field(data.get("notice_period")),
        "renewal_terms": _norm_contract_field(data.get("renewal_terms")),
        "late_payment_penalties": _norm_contract_field(data.get("late_payment_penalties")),
    }
    np_val = fields["notice_period"]
    if "not found" not in np_val.lower():
        fields["notice_period"] = _compact_notice_period_display(np_val)
    rt_val = fields["renewal_terms"]
    if "not found" not in rt_val.lower():
        fields["renewal_terms"] = _truncate_for_dashboard(rt_val, 120)
    lp_val = fields["late_payment_penalties"]
    if "not found" not in lp_val.lower():
        fields["late_payment_penalties"] = _truncate_for_dashboard(lp_val, 120)

    risks = data.get("risks")
    if not isinstance(risks, list):
        risks = []
    conflicts = data.get("conflicts")
    if not isinstance(conflicts, list):
        conflicts = []
    summary = str(data.get("final_summary") or "").strip()
    rec = str(data.get("recommendation") or "CAUTION").strip().upper()
    if rec not in ("SAFE", "CAUTION", "HIGH_RISK"):
        rec = "CAUTION"

    contract_fields = {
        "rent": fields["monthly_rent"],
        "rent_quote": _norm_quote(data.get("monthly_rent_quote")),
        "deposit": fields["deposit"],
        "deposit_quote": _norm_quote(data.get("deposit_quote")),
        "start_date": fields["start_date"],
        "start_date_quote": _norm_quote(data.get("start_date_quote")),
        "end_date": fields["end_date"],
        "end_date_quote": _norm_quote(data.get("end_date_quote")),
        "notice_period": fields["notice_period"],
        "notice_period_quote": _norm_quote(data.get("notice_period_quote")),
        "renewal_terms": fields["renewal_terms"],
        "renewal_terms_quote": _norm_quote(data.get("renewal_terms_quote")),
        "late_payment_penalties": fields["late_payment_penalties"],
        "late_payment_penalties_quote": _norm_quote(data.get("late_payment_penalties_quote")),
    }
    missing_fields = [
        k for k, v in contract_fields.items()
        if not k.endswith("_quote") and "not found" in v.lower()
    ]
    confidence = max(30.0, 100.0 - len(missing_fields) * 12.0)
    dq = build_data_quality(session)

    full_analysis: dict[str, Any] = {
        "status": "approved",
        "validation": "approved",
        "data_quality": dq,
        "contract_fields": contract_fields,
        "conflicts": conflicts,
        "risks": risks,
        "missing_fields": missing_fields,
        "warnings": [],
        "final_summary": summary,
        "recommendation": rec,
        "confidence_score": round(confidence, 1),
    }
    validation_out = {"is_rental": True, "reason": reason or "Identified as a rental agreement from excerpts."}
    return validation_out, full_analysis


def classify_question(question: str) -> Literal["greeting", "off_topic", "contract"]:
    q = question.strip()
    if not q:
        return "off_topic"
    low = q.lower()
    # Any substantive contract question must reach RAG (greeting patterns like "Hi, what is rent?" are common).
    contract_markers = (
        "rent",
        "miete",
        "deposit",
        "kaution",
        "notice",
        "kündigung",
        "frist",
        "terminate",
        "termination",
        "lease",
        "landlord",
        "tenant",
        "mieter",
        "vermieter",
        "utility",
        "utilities",
        "nebenkosten",
        "betriebskosten",
        "umlage",
        "heiz",
        "warm",
        "clause",
        "section",
        "when",
        "how much",
        "how long",
        "what is",
        "what's",
        "whats",
        "who can",
        "explain",
        "obligations",
        "repair",
    )
    if any(m in low for m in contract_markers):
        return "contract"
    greetings = (
        "hi",
        "hello",
        "hey there",
        "good morning",
        "good afternoon",
        "good evening",
        "thanks",
        "thank you",
    )
    if any(low == g or low.startswith(g + " ") or low.startswith(g + ",") for g in greetings):
        return "greeting"
    off_tokens = (
        "weather",
        "temperature forecast",
        "who won the",
        "capital of",
        "stock price",
        "bitcoin",
        "recipe for",
        "translate this poem",
    )
    if any(t in low for t in off_tokens):
        return "off_topic"
    return "contract"


def chat_context_chunks(session: SessionState, question: str) -> list[str]:
    """Head of lease + semantic hits so chat is not limited to three mid-document chunks."""
    k = max(1, min(CHAT_TOP_K, len(session.chunks)))
    head_n = max(0, min(CHAT_HEAD_CHUNKS, len(session.chunks)))
    seen: set[str] = set()
    out: list[str] = []
    for c in session.chunks[:head_n]:
        if c not in seen:
            seen.add(c)
            out.append(c)
    for c in retrieve_chunks(session, question, k=k):
        if c not in seen:
            seen.add(c)
            out.append(c)
    cap = min(len(out), CHAT_TOP_K + CHAT_HEAD_CHUNKS + 2)
    return out[:cap]


def answer_question(session: SessionState, question: str) -> str:
    """Retrieval over head + query chunks, then one Ollama completion."""
    kind = classify_question(question)
    if kind == "greeting":
        return (
            "Hello. I can answer questions about your uploaded rental contract. "
            "Try asking about rent, deposit, notice period, or termination."
        )
    if kind == "off_topic":
        return "I can only help with your uploaded contract."

    chunks = chat_context_chunks(session, question)
    user_prompt = f"""User question: {question}

Answer using ONLY the excerpts above. Quote or paraphrase the relevant lines.
If the answer is not in the excerpts, say exactly: Not found in contract.
Keep the answer concise (2–3 sentences), then add a citation on a new line in the format: [Source: Page X] — use the [Page N] markers visible in the excerpts."""
    return llm_text_from_context(
        GROUNDING_SYSTEM,
        user_prompt,
        chunks,
        max_chunks=len(chunks),
    )


def delete_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
