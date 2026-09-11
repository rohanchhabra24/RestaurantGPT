from fastapi import APIRouter
from pydantic import BaseModel

from app.services import eval_service

router = APIRouter(prefix="/api/eval", tags=["eval"])


@router.get("/run")
async def run_eval():
    return await eval_service.run_golden_set()


class CompareIn(BaseModel):
    question: str


@router.post("/compare")
async def compare(body: CompareIn):
    return await eval_service.naive_vs_grounded(body.question)
