"""GET /api/news + POST /api/admin/refresh-news

The read endpoint backs the Market Pulse rail in the frontend; the admin
endpoint is a manual trigger for the hackathon (a cron will replace it
later). Both degrade gracefully — when there's no cache or no key, they
return an empty list rather than a 5xx.
"""

from fastapi import APIRouter, Query

from app.schemas.news import NewsArticle, NewsResponse, RefreshResult
from app.services import news as news_svc

router = APIRouter(prefix="/api", tags=["news"])


@router.get("/news", response_model=NewsResponse)
def get_news(
    brand: str | None = Query(default=None, description="Brand tag, e.g. 'estrella'"),
    channel: str | None = Query(default=None, description="Channel tag, e.g. 'tesco'"),
    limit: int = Query(default=20, ge=1, le=100),
) -> NewsResponse:
    articles, updated_at = news_svc.list_articles(
        brand=brand, channel=channel, limit=limit,
    )
    return NewsResponse(articles=articles, updated_at=updated_at)


@router.post("/admin/refresh-news", response_model=RefreshResult)
def refresh_news() -> RefreshResult:
    """Re-run Tavily, merge into the cache, purge >30-day rows.

    Hackathon-grade endpoint: no auth. Don't link from the UI. Call from
    a script or `make news`.
    """
    outcome = news_svc.refresh()
    return RefreshResult(
        fetched=outcome.fetched,
        new_articles=outcome.new_articles,
        cache_size=outcome.cache_size,
        updated_at=outcome.updated_at,
        error=outcome.error,
    )
