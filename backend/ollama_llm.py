"""
LLM via Groq API. Drop-in replacement for the previous Ollama implementation.
Set GROQ_API_KEY in your environment (or .env file).
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from groq import Groq

from env_load import load_project_env

load_project_env()

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"

_client_instance: Groq | None = None


class OllamaServiceError(RuntimeError):
    """LLM service unreachable or generation failed."""
    pass


def _client() -> Groq:
    global _client_instance
    if not GROQ_API_KEY:
        raise OllamaServiceError(
            "GROQ_API_KEY is not set. Add it to your .env file or environment variables."
        )
    if _client_instance is None:
        _client_instance = Groq(api_key=GROQ_API_KEY)
    return _client_instance


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
    """One Groq completion; response must be JSON."""
    user = (
        user_prompt
        + "\n\nOutput a single JSON object only. No markdown fences, no commentary before or after."
    )

    try:
        completion = _client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=2500,
        )
    except Exception as e:
        raise OllamaServiceError(
            f"Groq request failed (model={GROQ_MODEL}). "
            f"Check your GROQ_API_KEY. Original error: {e}"
        ) from e

    text = (completion.choices[0].message.content or "").strip()
    if not text:
        raise OllamaServiceError("Groq returned an empty response.")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        try:
            return _parse_json_response(text)
        except json.JSONDecodeError as e2:
            raise OllamaServiceError(f"Model did not return valid JSON: {e2}") from e2


def ollama_text_generate(system_instruction: str, user_prompt: str, temperature: float = 0.2) -> str:
    """One Groq completion returning plain text."""
    try:
        completion = _client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=4096,
        )
    except Exception as e:
        raise OllamaServiceError(
            f"Groq request failed (model={GROQ_MODEL}). "
            f"Check your GROQ_API_KEY. Original error: {e}"
        ) from e

    return (completion.choices[0].message.content or "").strip()
