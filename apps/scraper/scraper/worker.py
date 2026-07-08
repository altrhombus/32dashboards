from __future__ import annotations

import threading
import time

import requests

from . import client, parser
from .config import Settings
from .state import ScraperState
from .timeutil import utc_now_iso


def _format_adjusted_total(total_raised_raw, adjustment: float) -> str:
    if total_raised_raw is None:
        return f"unknown (+{adjustment:+.2f})" if adjustment else "unknown"
    try:
        value = float(str(total_raised_raw).replace("$", "").replace(",", "")) + adjustment
        return f"${value:,.2f}"
    except ValueError:
        return f"{total_raised_raw} (+{adjustment:+.2f})"


def push_scrape_result(settings: Settings, items: list[parser.ScrapedItem], total_raised_raw, source_url: str) -> None:
    payload = {
        "items": [item.model_dump() for item in items],
        "totalRaisedRaw": total_raised_raw,
        "refreshedAt": utc_now_iso(),
        "sourceUrl": source_url,
    }
    response = requests.post(
        f"{settings.api_base_url}/internal/scrape-result",
        json=payload,
        headers={"Authorization": f"Bearer {settings.internal_token}"},
        timeout=settings.request_timeout_seconds,
    )
    response.raise_for_status()


def run_scrape_cycle(settings: Settings, state: ScraperState) -> None:
    target = state.get_target()
    if not target.is_configured:
        state.add_log("No scrape target configured yet -- skipping cycle")
        return

    state.add_log("Beginning scrape cycle")
    session = client.build_session(target.session_cookie, target.auth_token)
    items_url = target.items_url(settings.target_base_url)
    summary_url = target.summary_url(settings.target_base_url)

    try:
        items = client.fetch_items_with_retry(session, items_url, settings.request_timeout_seconds)
        parser.check_scrape_integrity(items)

        kept_items, filtered_out = parser.apply_filters(items, target.filters)
        for item, term in filtered_out:
            state.add_log(f"Filtered '{item.title or 'Untitled'}' (matched '{term}')")

        total_raised_raw = client.fetch_total_raised_with_retry(session, summary_url, settings.request_timeout_seconds)
        adjustment = state.get_adjustment()
        display_total = _format_adjusted_total(total_raised_raw, adjustment)

        push_scrape_result(settings, kept_items, total_raised_raw, items_url)

        state.record_success(display_total)
        state.add_log(f"Scrape complete: {len(kept_items)} items, total {display_total}")
    except parser.ScrapeIntegrityError as exc:
        state.record_error(str(exc))
        state.add_log(f"Scrape integrity check failed: {exc}")
    except Exception as exc:  # noqa: BLE001 -- top-level cycle guard: log and keep looping, never crash the worker thread
        state.record_error(str(exc))
        state.add_log(f"Scrape cycle failed: {exc}")


def worker_loop(settings: Settings, state: ScraperState, stop_event: threading.Event) -> None:
    state.add_log("Scraper worker starting")
    while not stop_event.is_set():
        if state.is_paused():
            stop_event.wait(1)
            continue

        run_scrape_cycle(settings, state)

        target = state.get_target()
        waited = 0.0
        while waited < target.refresh_interval_seconds:
            if stop_event.is_set() or state.consume_refresh_now() or state.is_paused():
                break
            time.sleep(0.5)
            waited += 0.5
