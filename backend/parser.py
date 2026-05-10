"""
PDF text extraction using pdfplumber.
"""

from __future__ import annotations

import io
import re
from typing import BinaryIO

import pdfplumber


def extract_pdf_text(file_bytes: bytes) -> str:
    """Extract plain text from a PDF byte buffer, with [Page N] markers for citation support."""
    buf = io.BytesIO(file_bytes)
    parts: list[str] = []
    with pdfplumber.open(buf) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            t = page.extract_text() or ""
            if t.strip():
                parts.append(f"[Page {i}]\n{t}")
    raw = "\n\n".join(parts)
    return normalize_whitespace(raw)


def normalize_whitespace(text: str) -> str:
    """Collapse excessive whitespace; preserve paragraph breaks."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def load_pdf_from_upload(upload: BinaryIO) -> bytes:
    """Read upload stream into bytes."""
    return upload.read()
