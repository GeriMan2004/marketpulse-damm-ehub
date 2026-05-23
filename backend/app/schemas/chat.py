from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    tool_calls: list[dict] = Field(default_factory=list)


class ChatRequest(BaseModel):
    session_id: str | None = None
    messages: list[ChatMessage]
