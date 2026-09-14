"""Local embedding model — no extra API key needed for retrieval.

all-MiniLM-L6-v2 (384-dim) is deliberately small: it runs on CPU fast enough
for interactive queries and keeps the demo to two API keys (Supabase,
Anthropic) instead of three. Swap for Voyage/OpenAI embeddings in
production if retrieval quality on real policy documents needs it —
the vector column width (`vector(384)` in migrations/001_init.sql) is the
only thing that would need to change alongside it.
"""

from functools import lru_cache


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("all-MiniLM-L6-v2")


def warm() -> None:
    """Loads the model now instead of lazily on whichever real request
    first touches retrieval or the semantic cache — call this once from
    main.py's lifespan (in a thread; loading is blocking CPU/disk work)
    so that request doesn't have to eat the load cost live."""
    _model()


def embed(text: str) -> list[float]:
    return _model().encode(text, normalize_embeddings=True).tolist()


def embed_batch(texts: list[str]) -> list[list[float]]:
    return _model().encode(texts, normalize_embeddings=True).tolist()
