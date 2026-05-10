"""
Local sentence-transformers embeddings (default: all-MiniLM-L6-v2).
Disk cache by content hash; in-memory LRU for query vectors.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

from env_load import load_project_env

EMBED_MODEL_NAME = (
    os.environ.get("ST_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2").strip()
    or "sentence-transformers/all-MiniLM-L6-v2"
)
_EMBED_BATCH_SIZE = int(os.environ.get("EMBED_BATCH_SIZE", "32"))
_QUERY_EMBED_CACHE_MAX = int(os.environ.get("QUERY_EMBED_CACHE_MAX", "256"))

_model_lock = threading.Lock()
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    with _model_lock:
        if _model is None:
            load_project_env()
            _model = SentenceTransformer(EMBED_MODEL_NAME)
        return _model


def _cache_dir() -> Path:
    base = Path(__file__).resolve().parent / ".cache" / "doc_embeddings"
    base.mkdir(parents=True, exist_ok=True)
    return base


def document_embedding_cache_key(
    contract_text: str, chunk_size: int, chunk_overlap: int, model: str | None = None
) -> str:
    m = model or EMBED_MODEL_NAME
    h = hashlib.sha256()
    h.update(m.encode())
    h.update(f"|{chunk_size}|{chunk_overlap}|".encode())
    h.update(contract_text.encode("utf-8", errors="replace"))
    return h.hexdigest()


def try_load_cached_document_embeddings(cache_key: str, expected_n: int) -> list[list[float]] | None:
    path = _cache_dir() / f"{cache_key}.npz"
    if not path.is_file():
        return None
    try:
        z = np.load(path, allow_pickle=False)
        arr = z["embeddings"]
        meta_raw = z["meta"].tobytes().decode("utf-8")
        meta = json.loads(meta_raw)
        if meta.get("model") != EMBED_MODEL_NAME:
            return None
        if int(meta.get("n", 0)) != expected_n or arr.shape[0] != expected_n:
            return None
        return [arr[i].astype(float).tolist() for i in range(expected_n)]
    except Exception:
        return None


def save_cached_document_embeddings(cache_key: str, vectors: list[list[float]]) -> None:
    try:
        path = _cache_dir() / f"{cache_key}.npz"
        arr = np.array(vectors, dtype=np.float32)
        meta = json.dumps({"n": len(vectors), "model": EMBED_MODEL_NAME}).encode("utf-8")
        np.savez_compressed(path, embeddings=arr, meta=np.frombuffer(meta, dtype=np.uint8))
    except OSError:
        pass


def embed_texts(texts: list[str], task_type: str = "") -> list[list[float]]:
    """Encode chunk texts locally. task_type is ignored (kept for API compatibility)."""
    _ = task_type
    if not texts:
        return []
    model = _get_model()
    batch = min(_EMBED_BATCH_SIZE, max(1, len(texts)))
    vecs = model.encode(
        texts,
        batch_size=batch,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=False,
    )
    return [vecs[i].astype(float).tolist() for i in range(len(texts))]


_query_embed_lru: dict[str, list[float]] = {}
_query_embed_order: list[str] = []


def embed_query(question: str) -> list[float]:
    key = hashlib.sha256(question.strip().encode("utf-8", errors="replace")).hexdigest()
    if key in _query_embed_lru:
        return _query_embed_lru[key]
    model = _get_model()
    v = model.encode(
        [question],
        batch_size=1,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=False,
    )[0]
    vec = v.astype(float).tolist()
    _query_embed_lru[key] = vec
    if key in _query_embed_order:
        _query_embed_order.remove(key)
    _query_embed_order.append(key)
    while len(_query_embed_order) > _QUERY_EMBED_CACHE_MAX:
        old = _query_embed_order.pop(0)
        _query_embed_lru.pop(old, None)
    return vec
