"""CLI entrypoint for the Market Pulse news refresh.

Usage:
    cd backend
    uv run python -m app.jobs.refresh_news

Or via the Makefile:
    make news

The job is idempotent — safe to call as often as you want. It will
return non-zero (and log to stderr) only on hard failures; missing API
key is a soft failure that prints a friendly message and exits 0 so
cron jobs don't email you.
"""

from __future__ import annotations

import logging
import sys

from app.services import news as news_svc


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
    )
    log = logging.getLogger("refresh_news")

    log.info("Starting Market Pulse refresh…")
    outcome = news_svc.refresh()

    if outcome.error:
        # Print to stdout (not stderr) so this is friendly for `make` output.
        # Soft failure: cache is preserved, no crash.
        print(f"⚠️  {outcome.error}")
        print(f"   Cache left untouched ({outcome.cache_size} articles).")
        return 0

    log.info(
        "Refresh complete: fetched=%d  new=%d  cache=%d",
        outcome.fetched, outcome.new_articles, outcome.cache_size,
    )
    print(
        f"✅ Fetched {outcome.fetched} results · {outcome.new_articles} new "
        f"· cache now holds {outcome.cache_size} articles."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
