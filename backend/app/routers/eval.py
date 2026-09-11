from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import require_tenant
from app.services import eval_service, rate_limit

router = APIRouter(prefix="/api/eval", tags=["eval"])


@router.get("/run")
async def run_eval(restaurant_id: str = Depends(require_tenant)):
    await rate_limit.check_and_record(restaurant_id, "eval_run")
    return await eval_service.run_golden_set(restaurant_id)


class CompareIn(BaseModel):
    question: str


@router.post("/compare")
async def compare(body: CompareIn, restaurant_id: str = Depends(require_tenant)):
    await rate_limit.check_and_record(restaurant_id, "eval_compare")
    return await eval_service.naive_vs_grounded(body.question, restaurant_id)
