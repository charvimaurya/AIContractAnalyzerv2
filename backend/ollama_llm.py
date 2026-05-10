"""
Local LLM via Ollama (default: llama3.1:latest). Uses only user-provided context in prompts.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, cast

import ollama

from env_load import load_project_env

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").strip() or "http://127.0.0.1:11434"


def _ollama_options(*, temperature: float, num_predict: int) -> dict[str, Any]:
    """Larger context window so long excerpt blocks are not truncated."""
    return {
        "temperature": temperature,
        "num_ctx": int(os.environ.get("OLLAMA_NUM_CTX", "16384")),
        "num_predict": num_predict,
    }


def _message_content(response: Any) -> str:
    """Support both dict and object-shaped SDK responses."""
    msg = getattr(response, "message", None)
    if msg is not None:
        c = getattr(msg, "content", None)
        if c is not None:
            return str(c).strip()
    if isinstance(response, dict):
        m = response.get("message")
        if isinstance(m, dict):
            return str(m.get("content") or "").strip()
        if m is not None:
            c = getattr(m, "content", None)
            if c is not None:
                return str(c).strip()
    return ""


def _ollama_model() -> str:
    """Ollama expects a concrete tag (e.g. llama3.1:latest); bare 'llama3.1' often 404s."""
    load_project_env()
    m = (os.environ.get("OLLAMA_MODEL") or "llama3.1:latest").strip() or "llama3.1:latest"
    if m == "llama3.1":
        return "llama3.1:latest"
    return m


OLLAMA_MODEL = _ollama_model()


class OllamaServiceError(RuntimeError):
    """Ollama unreachable, model missing, or generation failed."""

    pass


def _client() -> ollama.Client:
    return ollama.Client(host=OLLAMA_HOST)


def _messages(system: str, user: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _parse_json_response(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```\s*$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw = raw[start : end + 1]
    return json.loads(raw)


def ollama_json_generate(system_instruction: str, user_prompt: str, temperature: float = 0.1) -> dict[str, Any]:
    """One chat completion; response must be JSON."""
    user = (
        user_prompt
        + "\n\nOutput a single JSON object only. No markdown fences, no commentary before or after."
    )
    pred = int(os.environ.get("OLLAMA_NUM_PREDICT_JSON", "8192"))
    try:
        r = _client().chat(
            model=OLLAMA_MODEL,
            messages=_messages(system_instruction, user),
            options=_ollama_options(temperature=temperature, num_predict=pred),
        )
    except Exception as e:
        raise OllamaServiceError(
            f"Ollama request failed (model={OLLAMA_MODEL}, host={OLLAMA_HOST}). "
            "Run `ollama serve`, then `ollama pull llama3.1` (or your model), and check names with `ollama list`. "
            f"Set OLLAMA_MODEL in .env to an exact name from that list. Original error: {e}"
        ) from e
    text = _message_content(cast(Any, r))
    if not text:
        raise OllamaServiceError("Ollama returned an empty response.")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        try:
            return _parse_json_response(text)
        except json.JSONDecodeError as e2:
            raise OllamaServiceError(f"Model did not return valid JSON: {e2}") from e2


def ollama_text_generate(system_instruction: str, user_prompt: str, temperature: float = 0.2) -> str:
    pred = int(os.environ.get("OLLAMA_NUM_PREDICT_TEXT", "4096"))
    try:
        r = _client().chat(
            model=OLLAMA_MODEL,
            messages=_messages(system_instruction, user_prompt),
            options=_ollama_options(temperature=temperature, num_predict=pred),
        )
    except Exception as e:
        raise OllamaServiceError(
            f"Ollama request failed (model={OLLAMA_MODEL}, host={OLLAMA_HOST}). "
            "Run `ollama serve`, then `ollama pull llama3.1` (or your model), and check names with `ollama list`. "
            f"Set OLLAMA_MODEL in .env to an exact name from that list. Original error: {e}"
        ) from e
    return _message_content(cast(Any, r))
