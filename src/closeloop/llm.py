"""Shared LLM provider config for CloseLoop's Tier-3 adjudicator and Q&A agent.

CloseLoop talks to **Google Gemini** through its OpenAI-compatible endpoint, so
both LLM surfaces use the standard `openai` chat-completions API. Gemini has a
genuinely **free tier** (get a key at https://aistudio.google.com/apikey) — no
billing is required to run this project end to end, including the LLM tiers.

The whole system still runs with NO key at all: every LLM surface degrades to a
conservative, honest fallback (see adjudicator.py / qa_agent.py). The key only
unlocks the measurable Tier-3 lift and the natural-language Q&A.

Everything is env-configurable, so you can point at any OpenAI-compatible
provider (Gemini, Groq, a local Ollama, ...) without touching code:

  GEMINI_API_KEY / GOOGLE_API_KEY / LLM_API_KEY   the API key (any one)
  LLM_BASE_URL                                     override the endpoint
  CLOSELOOP_MODEL                                  override the model id
"""
from __future__ import annotations

import os
from typing import Optional

# Gemini's OpenAI-compatible endpoint — works with the stock `openai` SDK.
DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_MODEL = "gemini-3.6-flash"


def api_key() -> Optional[str]:
    """The configured key, from any of the accepted env vars (or None)."""
    return (os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or os.getenv("LLM_API_KEY"))


def model_name() -> str:
    return os.getenv("CLOSELOOP_MODEL", DEFAULT_MODEL)


def base_url() -> str:
    return os.getenv("LLM_BASE_URL", DEFAULT_BASE_URL)


def configured() -> bool:
    """True when a key is present — cheap check for /health, no client built."""
    return api_key() is not None


def make_client():
    """An OpenAI-compatible client for the configured provider, or None when no
    key/SDK is available (callers then fall back gracefully)."""
    key = api_key()
    if not key:
        return None
    try:
        from openai import OpenAI
    except ImportError:
        return None
    try:
        return OpenAI(api_key=key, base_url=base_url())
    except Exception:  # pragma: no cover - defensive
        return None
