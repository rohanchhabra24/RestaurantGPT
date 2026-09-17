from typing import Literal
from pydantic import BaseModel, Field


Route = Literal["SQL", "RETRIEVAL", "HYBRID", "DIAGNOSTIC", "CLARIFY"]
GroundingVerdict = Literal["grounded", "ungrounded", "partial", "no_claims"]

# A chat question has no legitimate reason to be this long — bounding it
# keeps a single request from blowing up prompt size/cost (an abuse vector
# rate limiting alone doesn't close, since it's still just "one request").
MAX_QUESTION_LENGTH = 2000


class Citation(BaseModel):
    type: Literal["order", "policy"]
    ref_id: str
    label: str
    verified: bool
    detail: dict | None = None


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_QUESTION_LENGTH)


class MessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    citations: list[Citation] = []
    route_taken: Route | None = None
    generated_sql: str | None = None
    grounding_verdict: GroundingVerdict | None = None
    citation_coverage: float | None = None
    latency_ms_by_stage: dict[str, int] = {}
    trace_id: str | None = None
    data_table: list[dict] = []
    investigation_steps: list[str] = []
    from_cache: bool = False
    cache_similarity: float | None = None
    feedback: Literal["up", "down"] | None = None


class ConversationOut(BaseModel):
    id: str
    title: str | None
    created_at: str
