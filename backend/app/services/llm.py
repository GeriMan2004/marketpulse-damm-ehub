"""LLM routing — fast (Llama-Groq) / deep (Kimi-Novita) / fallback (Qwen).

The token is resolved in this priority order:
  1. HF_TOKEN env var (from backend/.env, loaded by python-dotenv)
  2. ~/.cache/huggingface/token (set by `hf auth login`)

Either works. .env is simpler for fresh clones; the cache is simpler for
single-user dev once you've logged in once.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from huggingface_hub import InferenceClient
from huggingface_hub.errors import HfHubHTTPError

# Load .env from the backend root the first time this module is imported
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MODELS: dict[str, tuple[str, str | None]] = {
    "fast":     ("meta-llama/Llama-3.3-70B-Instruct", "groq"),
    "deep":     ("moonshotai/Kimi-K2-Instruct",       "novita"),
    "fallback": ("Qwen/Qwen2.5-72B-Instruct",         None),
}


def _resolve_token() -> str:
    """Env first, then huggingface_hub cache."""
    tok = (os.getenv("HF_TOKEN") or "").strip()
    if tok:
        return tok
    cache = Path.home() / ".cache" / "huggingface" / "token"
    if cache.is_file():
        return cache.read_text().strip()
    raise RuntimeError(
        "No Hugging Face token found. Either set HF_TOKEN in backend/.env "
        "or run `hf auth login` to populate ~/.cache/huggingface/token."
    )


def get_client(profile: str = "fast", timeout: float | None = 25.0) -> InferenceClient:
    """Build an InferenceClient for the requested profile.

    Default timeout is 25s — without it the client can hang for minutes on
    a stalled provider, which freezes the dashboard's Options tab. Routers
    that need a longer ceiling can pass timeout=None.
    """
    if profile not in MODELS:
        raise ValueError(f"Unknown profile {profile!r}. Choices: {list(MODELS)}")
    model, provider = MODELS[profile]
    kw: dict[str, Any] = {"model": model, "token": _resolve_token(), "timeout": timeout}
    if provider:
        kw["provider"] = provider
    return InferenceClient(**kw)


def call_with_fallback(profile: str, **chat_kwargs):
    """Try the chosen profile; on provider error, fall through deep → fast → fallback."""
    chain = list(dict.fromkeys([profile, "fast", "fallback"]))
    last_err: Exception | None = None
    for p in chain:
        try:
            return get_client(p).chat_completion(**chat_kwargs)
        except (HfHubHTTPError, TimeoutError) as e:
            last_err = e
            continue
    raise last_err if last_err else RuntimeError("All profiles failed without raising")
