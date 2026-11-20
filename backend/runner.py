"""Local development server launcher."""

from __future__ import annotations

import argparse
import logging

import uvicorn

from . import config
from .db import init_db
from .seed import seed_if_empty

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run the trans_sport API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--no-seed", action="store_true", help="Do not insert demo data")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    init_db()
    if not args.no_seed:
        seed_if_empty()
    logger.info("Database: %s", config.DATABASE_URL.split("://")[0] + "://...")
    logger.info("Docs: http://%s:%s/docs", args.host, args.port)
    uvicorn.run(
        "backend.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=config.LOG_LEVEL.lower(),
    )


if __name__ == "__main__":
    main()
