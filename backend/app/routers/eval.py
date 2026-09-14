from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.auth import require_tenant
from app.config import settings
from app.models import MAX_QUESTION_LENGTH
from app.services import eval_service, rate_limit
from app.services.ip_rate_limit import limiter

router = APIRouter(prefix="/api/eval", tags=["eval"])


@router.get("/run")
@limiter.limit(settings.ip_rate_limit_ai)
async def run_eval(request: Request, restaurant_id: str = Depends(require_tenant)):
    await rate_limit.check_and_record(restaurant_id, "eval_run")
    return await eval_service.run_golden_set(restaurant_id)


@router.get("/run/multilingual")
@limiter.limit(settings.ip_rate_limit_ai)
async def run_eval_multilingual(request: Request, restaurant_id: str = Depends(require_tenant)):
    """Stage 2F's release gate — English/Hindi/Hinglish golden sets plus
    whether each non-English language clears the tolerance-vs-English-
    baseline bar. See eval_service.run_multilingual_gate."""
    await rate_limit.check_and_record(restaurant_id, "eval_run")
    return await eval_service.run_multilingual_gate(restaurant_id)


class CompareIn(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION_LENGTH)


@router.post("/compare")
@limiter.limit(settings.ip_rate_limit_ai)
async def compare(request: Request, body: CompareIn, restaurant_id: str = Depends(require_tenant)):
    await rate_limit.check_and_record(restaurant_id, "eval_compare")
    return await eval_service.naive_vs_grounded(body.question, restaurant_id)
