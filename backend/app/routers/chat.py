import asyncio
import json

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.schemas import ChatRequest

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat")
async def chat(req: ChatRequest):
    """Mock streaming response. Real impl runs the smolagents CodeAgent on `fast` profile."""

    async def event_stream():
        yield {"event": "thought", "data": json.dumps({"text": "Looking up the gap for the hero SKU..."})}
        await asyncio.sleep(0.3)
        yield {"event": "tool_call", "data": json.dumps({
            "name": "compare_vs_budget",
            "args": {"sku": "K015600", "sub_channel": "GROCERY", "period": "Nov.26"},
        })}
        await asyncio.sleep(0.3)
        yield {"event": "tool_result", "data": json.dumps({
            "name": "compare_vs_budget",
            "result_summary": "Gap -170 Hl (-4.1%)",
        })}
        await asyncio.sleep(0.2)
        for chunk in ["The ", "November ", "gap ", "is ", "-4.1% ", "vs ", "budget."]:
            yield {"event": "token", "data": json.dumps({"text": chunk})}
            await asyncio.sleep(0.05)
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_stream())
