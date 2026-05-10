"""
FastAPI application: PDF upload with RAG indexing and grounded Q&A.
"""

from __future__ import annotations

import os

from env_load import load_project_env

# Load .env for Ollama host, embedding model, etc.
load_project_env()

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from parser import extract_pdf_text
from ollama_llm import OllamaServiceError
from rag import (
    TOP_K,
    answer_question,
    build_session_from_text,
    commit_session,
    delete_session,
    get_session,
    validate_and_analyze_upload,
)

app = FastAPI(title="Rental Contract RAG API", version="1.0.0")

# Browsers reject Access-Control-Allow-Origin: * when credentials mode is used.
# We use cookie-less API calls, so credentials=False avoids "Failed to fetch" on cross-origin.
_origins = os.environ.get("CORS_ORIGINS", "*").strip()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins.split(",") if _origins else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

MIN_TEXT_CHARS = 120


class AskRequest(BaseModel):
    session_id: str = Field(..., description="Session id returned by POST /upload")
    question: str = Field(..., min_length=1, description="User question")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload")
async def upload_contract(file: UploadFile = File(...)):
    """
    Accept a PDF, extract text, chunk, embed into FAISS, run grounded analysis.
    Indexes locally; the LLM (Ollama) sees only retrieved chunks (max 3 per call).
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported for analysis.")
    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        text = extract_pdf_text(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse PDF: {exc}") from exc

    if len(text.strip()) < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=422,
            detail="Extracted text is too short. Provide a readable rental agreement PDF.",
        )

    try:
        session = build_session_from_text(text)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not index document (chunk/embed): {exc}",
        ) from exc

    try:
        validation, analysis = validate_and_analyze_upload(session)
        if not validation.get("is_rental", False):
            reason = validation.get("reason") or "This document does not appear to be a rental agreement."
            return {
                "status": "rejected",
                "reason": reason,
                "supported_inputs": ["PDF residential lease", "rental agreement"],
                "next_step": "Upload a residential lease or rental agreement PDF with selectable text or clear scans.",
                "session_id": None,
                "analysis": None,
                "chunks_indexed": len(session.chunks),
                "retrieval_top_k": TOP_K,
            }

        if analysis is None:
            delete_session(session.session_id)
            raise HTTPException(status_code=500, detail="Analysis produced no result.")

        commit_session(session)
        analysis["status"] = "approved"

        return {
            "status": "approved",
            "session_id": session.session_id,
            "analysis": analysis,
            "chunks_indexed": len(session.chunks),
            "retrieval_top_k": TOP_K,
        }
    except OllamaServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        delete_session(session.session_id)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc


@app.post("/ask")
def ask(body: AskRequest):
    """Embed the question locally, retrieve top chunks, answer with Ollama using ONLY those chunks."""
    session = get_session(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session_id. Upload the contract again.")

    try:
        answer = answer_question(session, body.question)
    except OllamaServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not generate answer: {exc}") from exc

    return {
        "answer": answer,
        "session_id": body.session_id,
        "retrieval_top_k": TOP_K,
    }
