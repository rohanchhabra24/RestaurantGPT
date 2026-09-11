from typing import Literal
from pydantic import BaseModel


Route = Literal["SQL", "RETRIEVAL", "HYBRID", "CLARIFY"]
GroundingVerdict = Literal["grounded", "ungrounded", "partial", "no_claims"]


class Citation(BaseModel):
    type: Literal["order", "policy"]
    ref_id: str
    label: str
    verified: bool
    detail: dict | None = None


class MessageIn(BaseModel):
    content: str


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


class ConversationOut(BaseModel):
    id: str
    title: str | None
    created_at: str
