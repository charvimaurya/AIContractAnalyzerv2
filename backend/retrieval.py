"""
FAISS-backed vector store for contract chunks. One index per upload session.
"""

from __future__ import annotations

from dataclasses import dataclass

import faiss
import numpy as np


def _l2_normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-12)
    return vectors / norms


@dataclass
class ChunkStore:
    """Maps FAISS row index to chunk text."""

    chunks: list[str]
    index: faiss.IndexFlatIP
    dim: int

    def search(self, query_vec: list[float], k: int = 3) -> list[str]:
        """Return up to k chunk texts (caller may cache identical queries)."""
        k = max(0, min(k, len(self.chunks)))
        if k <= 0:
            return []
        q = np.array([query_vec], dtype=np.float32)
        q = _l2_normalize(q)
        scores, indices = self.index.search(q, k)
        seen: set[int] = set()
        out: list[str] = []
        for idx in indices[0]:
            if idx < 0 or idx in seen:
                continue
            seen.add(int(idx))
            out.append(self.chunks[int(idx)])
        return out


def build_chunk_store(chunks: list[str], embeddings: list[list[float]]) -> ChunkStore:
    if len(chunks) != len(embeddings):
        raise ValueError("chunks and embeddings length mismatch")
    if not chunks:
        raise ValueError("no chunks to index")
    dim = len(embeddings[0])
    mat = np.array(embeddings, dtype=np.float32)
    mat = _l2_normalize(mat)
    index = faiss.IndexFlatIP(dim)
    index.add(mat)
    return ChunkStore(chunks=chunks, index=index, dim=dim)
