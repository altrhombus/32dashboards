from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

from .timeutil import format_iso

logger = logging.getLogger("scraper")


class ScrapeTarget(BaseModel):
    """The currently-configured scrape target -- pushed here via POST /config
    whenever an admin activates an event or edits its scraperSource."""

    org_id: str = ""
    auction_id: str = ""
    friendly_auction_path: str = ""
    session_cookie: Optional[str] = None
    auth_token: Optional[str] = None
    refresh_interval_seconds: int = 10
    filters: list[str] = Field(default_factory=list)

    @property
    def is_configured(self) -> bool:
        return bool(self.org_id and self.auction_id and self.friendly_auction_path)

    def items_url(self, base_url: str) -> str:
        return f"{base_url}/organizations/{self.org_id}/auctions/{self.auction_id}?r=1&t=all"

    def summary_url(self, base_url: str) -> str:
        return f"{base_url}/{self.friendly_auction_path}"


class ScraperState:
    """All mutable runtime state, behind one lock. Single-process service, so a plain lock is sufficient."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.target = ScrapeTarget()
        self.paused = False
        self.refresh_now = False
        self.manual_adjustment = 0.0
        self.last_refresh: Optional[datetime] = None
        self.last_total_display: Optional[str] = None
        self.last_error: Optional[str] = None
        self.logs: list[dict] = []
        self.max_logs = 200

    def add_log(self, message: str) -> None:
        # Also emitted via the standard logger (see main.py's basicConfig)
        # so operational history shows up in `docker logs`, not only via the
        # authenticated /logs endpoint's in-memory ring buffer.
        logger.info(message)
        with self._lock:
            self.logs.append({"timestamp": format_iso(datetime.now(timezone.utc)), "message": message})
            if len(self.logs) > self.max_logs:
                self.logs.pop(0)

    def get_logs(self) -> list[dict]:
        with self._lock:
            return list(self.logs)

    def set_target(self, target: ScrapeTarget) -> None:
        with self._lock:
            self.target = target

    def get_target(self) -> ScrapeTarget:
        with self._lock:
            return self.target

    def set_paused(self, paused: bool) -> None:
        with self._lock:
            self.paused = paused

    def is_paused(self) -> bool:
        with self._lock:
            return self.paused

    def request_refresh_now(self) -> None:
        with self._lock:
            self.refresh_now = True

    def consume_refresh_now(self) -> bool:
        with self._lock:
            if self.refresh_now:
                self.refresh_now = False
                return True
            return False

    def set_filters(self, filters: list[str]) -> None:
        with self._lock:
            self.target = self.target.model_copy(update={"filters": filters})

    def set_adjustment(self, amount: float) -> None:
        with self._lock:
            self.manual_adjustment = amount

    def get_adjustment(self) -> float:
        with self._lock:
            return self.manual_adjustment

    def record_success(self, total_display: Optional[str]) -> None:
        with self._lock:
            self.last_refresh = datetime.now(timezone.utc)
            self.last_total_display = total_display
            self.last_error = None

    def record_error(self, error: str) -> None:
        with self._lock:
            self.last_error = error

    def status_snapshot(self) -> dict:
        with self._lock:
            return {
                "paused": self.paused,
                "target": self.target.model_dump(exclude={"session_cookie", "auth_token"}),
                "lastRefresh": format_iso(self.last_refresh) if self.last_refresh else None,
                "lastTotalDisplay": self.last_total_display,
                "lastError": self.last_error,
                "manualAdjustment": self.manual_adjustment,
            }


state = ScraperState()
