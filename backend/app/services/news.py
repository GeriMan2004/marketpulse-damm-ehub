"""Market Pulse news service — Tavily fetcher, keyword tagger, JSON cache.

Why the design choices:

1. Three narrow queries, not one broad one. Tavily's free tier caps usage,
   and a single open-ended query ("UK beer news") drowns in noise. The
   three queries split the surface area: own brands × grocers, category
   competitors × moves, demand drivers (weather/football/pubs).

2. Keyword tagging, not LLM tagging. The handoff is explicit: tagging
   quality is the #1 risk, and LLM classification on 30 short snippets per
   refresh is a rabbit hole. Plain `lowercase contains` is auditable and
   fixable in 30 seconds when a tag mis-fires.

3. JSON file cache. The rest of the backend uses parquet snapshots for ML
   data and Mongo for (eventual) live state. News is small (KBs), changes
   slowly (every few hours), and benefits from dedup-by-hash on every
   write. A single JSON file at app/data/cache/news/articles.json is the
   simplest thing that works.

4. Graceful degradation. Missing API key, Tavily downtime, malformed
   response — none of these should crash the running app. They should
   return the existing cache (or empty) and log the issue. The frontend
   rail's empty state covers the rest.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

from app.schemas.news import NewsArticle

log = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────
# Configuration — kept inline so the file is self-documenting
# ──────────────────────────────────────────────────────────────────────────

# Cache file lives alongside the other snapshots/cache dirs.
CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache" / "news"
CACHE_FILE = CACHE_DIR / "articles.json"

# Three curated queries. See module docstring for rationale.
QUERIES: list[str] = [
    # Damm brands × UK grocers — narrow, high signal
    '("Estrella Damm" OR "Cruzcampo") (Tesco OR Sainsbury OR Asda OR Morrisons OR Waitrose) UK',
    # UK lager category — competitor + price moves
    'UK lager beer (price OR promotion OR launch OR delisting) (Carlsberg OR Heineken OR "Madri" OR "San Miguel")',
    # Demand drivers — heatwaves, football, pub trade
    'UK ("heatwave" OR "England football" OR "pub trade" OR "on-trade" OR "off-trade") beer 2026',
]

# Trade press first, mainstream UK news as fallback. Tavily honours this
# strictly — anything outside the list is dropped server-side.
INCLUDE_DOMAINS: list[str] = [
    "thegrocer.co.uk",
    "morningadvertiser.co.uk",
    "bbc.co.uk",
    "ft.com",
    "reuters.com",
    "thedrinksbusiness.com",
    "talkingretail.com",
    "bighospitality.co.uk",
]

# Keyword tag lookups. Plain substring matching against (title + summary)
# lowercased. Untagged articles ARE still kept — they provide general
# market context.
BRAND_TAGS: dict[str, list[str]] = {
    "estrella":   ["estrella damm", "estrella"],
    "cruzcampo":  ["cruzcampo"],
    "madri":      ["madri"],
    "san_miguel": ["san miguel"],
    "competitor": ["carlsberg", "heineken", "stella artois", "peroni", "birra moretti"],
}
CHANNEL_TAGS: dict[str, list[str]] = {
    "tesco":      ["tesco"],
    "sainsburys": ["sainsbury"],
    "asda":       ["asda"],
    "morrisons":  ["morrisons"],
    "waitrose":   ["waitrose"],
    "on_trade":   ["pub", "on-trade", "hospitality"],
}
EVENT_TAGS: dict[str, list[str]] = {
    "price":      ["price cut", "price rise", "discount", "promotion"],
    "launch":     ["launches", "launch", "rolls out", "new range"],
    "delisting":  ["delist", "axes", "drops"],
    "weather":    ["heatwave", "temperature", "weather"],
    "regulation": ["minimum unit pricing", "mup", "duty"],
}

# How far back Tavily should look on each refresh, and how far back the
# cache should keep history.
TAVILY_RECENT_DAYS = 14
CACHE_RETENTION_DAYS = 30


# ──────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_url(url: str) -> str:
    """SHA1 of the URL — used as the dedup key."""
    return hashlib.sha1(url.strip().lower().encode("utf-8")).hexdigest()


def _source_domain(url: str) -> str:
    try:
        host = (urlparse(url).hostname or "").lower()
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return ""


def _tag(text: str, lookup: dict[str, list[str]]) -> list[str]:
    """Return all tag keys whose keywords appear in `text` (case-insensitive)."""
    if not text:
        return []
    haystack = text.lower()
    return [tag for tag, needles in lookup.items() if any(n in haystack for n in needles)]


def _parse_dt(raw: Any) -> datetime | None:
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, str):
        # Tavily returns ISO 8601; sometimes without TZ. Handle both.
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


# ──────────────────────────────────────────────────────────────────────────
# Cache (JSON file, dedup by URL hash)
# ──────────────────────────────────────────────────────────────────────────


def _read_cache() -> dict[str, NewsArticle]:
    """Load the cache into a {id: NewsArticle} dict. Missing file → empty."""
    if not CACHE_FILE.is_file():
        return {}
    try:
        raw = json.loads(CACHE_FILE.read_text())
    except (json.JSONDecodeError, OSError) as e:
        log.warning("Could not read news cache (%s); treating as empty.", e)
        return {}
    out: dict[str, NewsArticle] = {}
    for item in raw.get("articles", []):
        try:
            art = NewsArticle.model_validate(item)
            out[art.id] = art
        except Exception as e:
            log.debug("Dropping unparseable cached article: %s", e)
    return out


def _write_cache(articles: Iterable[NewsArticle]) -> None:
    """Atomically write the cache. Preserves dir if missing."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": _now().isoformat(),
        "articles": [a.model_dump(mode="json") for a in articles],
    }
    tmp = CACHE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2, default=str))
    tmp.replace(CACHE_FILE)


def _cache_updated_at() -> datetime | None:
    if not CACHE_FILE.is_file():
        return None
    try:
        raw = json.loads(CACHE_FILE.read_text())
        return _parse_dt(raw.get("updated_at"))
    except (json.JSONDecodeError, OSError):
        return None


# ──────────────────────────────────────────────────────────────────────────
# Tavily fetch + tag
# ──────────────────────────────────────────────────────────────────────────


@dataclass
class RefreshOutcome:
    fetched: int
    new_articles: int
    cache_size: int
    updated_at: datetime
    error: str | None = None


def _normalise_result(raw: dict, query_score_floor: float = 0.0) -> NewsArticle | None:
    """Map a Tavily result row to our NewsArticle. Returns None if unusable."""
    url = (raw.get("url") or "").strip()
    title = (raw.get("title") or "").strip()
    if not url or not title:
        return None

    summary = (raw.get("content") or raw.get("snippet") or "").strip()
    # Tavily occasionally returns huge snippets — cap so the rail stays scannable
    if len(summary) > 280:
        summary = summary[:277].rstrip() + "…"

    text_for_tagging = f"{title} {summary}"

    score = float(raw.get("score") or 0.0)
    if score < query_score_floor:
        return None

    return NewsArticle(
        id=_hash_url(url),
        url=url,
        title=title,
        summary=summary,
        source_domain=_source_domain(url),
        published_at=_parse_dt(raw.get("published_date") or raw.get("published_at")),
        fetched_at=_now(),
        brand_tags=_tag(text_for_tagging, BRAND_TAGS),
        channel_tags=_tag(text_for_tagging, CHANNEL_TAGS),
        event_tags=_tag(text_for_tagging, EVENT_TAGS),
        relevance_score=score,
    )


def _query_tavily(client, query: str) -> list[dict]:
    """Single Tavily search. Returns the raw 'results' list, never raises."""
    try:
        resp = client.search(
            query=query,
            search_depth="basic",
            max_results=10,
            days=TAVILY_RECENT_DAYS,
            include_domains=INCLUDE_DOMAINS,
            topic="news",
        )
    except Exception as e:
        log.warning("Tavily query failed (%s): %s", query[:60], e)
        return []
    return resp.get("results", []) or []


def refresh() -> RefreshOutcome:
    """Run the 3 queries, tag the results, merge into the cache, purge old rows.

    Idempotent: safe to run repeatedly. Failure modes return the existing
    cache state with an `error` field set on the outcome.
    """
    api_key = (os.getenv("TAVILY_API_KEY") or "").strip()
    cached = _read_cache()

    if not api_key:
        # Keep whatever cache we have; the FE will show empty if there's
        # nothing yet.
        return RefreshOutcome(
            fetched=0, new_articles=0, cache_size=len(cached),
            updated_at=_now(),
            error="TAVILY_API_KEY is not set. Add it to backend/.env and re-run `make news`.",
        )

    try:
        # Imported lazily so the rest of the backend boots even when the
        # tavily-python package isn't installed yet.
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
    except Exception as e:
        return RefreshOutcome(
            fetched=0, new_articles=0, cache_size=len(cached),
            updated_at=_now(),
            error=f"Could not initialise Tavily client: {e}",
        )

    fetched_total = 0
    new_count = 0
    for q in QUERIES:
        for row in _query_tavily(client, q):
            fetched_total += 1
            art = _normalise_result(row)
            if art is None:
                continue
            if art.id not in cached:
                new_count += 1
            # Always upsert — refreshes tags + relevance_score if Tavily
            # surfaced an updated snippet.
            cached[art.id] = art

    # Purge anything older than the retention window. Use published_at when
    # available, fetched_at otherwise — we'd rather over-keep than over-purge.
    cutoff = _now() - timedelta(days=CACHE_RETENTION_DAYS)
    kept = {
        aid: a for aid, a in cached.items()
        if (a.published_at or a.fetched_at) >= cutoff
    }

    _write_cache(kept.values())

    return RefreshOutcome(
        fetched=fetched_total,
        new_articles=new_count,
        cache_size=len(kept),
        updated_at=_now(),
        error=None,
    )


# ──────────────────────────────────────────────────────────────────────────
# Read API (consumed by the /api/news router)
# ──────────────────────────────────────────────────────────────────────────


def list_articles(
    *,
    brand: str | None = None,
    channel: str | None = None,
    limit: int = 20,
) -> tuple[list[NewsArticle], datetime | None]:
    """Return cached articles, optionally filtered by brand/channel tag.

    Sort: matching-brand articles first, then everything else, both within
    sub-buckets sorted by published_at desc → relevance_score desc.
    """
    cache = _read_cache()
    if not cache:
        return [], _cache_updated_at()

    def sort_key(a: NewsArticle):
        return (
            -(a.published_at or a.fetched_at).timestamp(),
            -a.relevance_score,
        )

    articles = list(cache.values())

    # Channel filter is a hard filter; brand filter is a soft re-ordering
    # so the rail still shows context when the SKU's brand has no news.
    if channel:
        articles = [a for a in articles if channel in a.channel_tags]

    if brand:
        matched = sorted([a for a in articles if brand in a.brand_tags], key=sort_key)
        rest = sorted([a for a in articles if brand not in a.brand_tags], key=sort_key)
        ranked = matched + rest
    else:
        ranked = sorted(articles, key=sort_key)

    return ranked[:limit], _cache_updated_at()
