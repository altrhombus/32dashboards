from __future__ import annotations

from datetime import datetime, timezone


def format_iso(dt: datetime) -> str:
    """Z-suffixed UTC ISO timestamp -- matches the format produced by JS's
    Date.toISOString(), which the TS API's zod .datetime() schema requires
    by default. Python's own datetime.isoformat() instead emits a "+00:00"
    offset for UTC, which zod rejects; this keeps the wire format canonical
    across both languages rather than loosening the schema to accept two
    different formats. Caught via a live scraper-to-API integration test."""
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def utc_now_iso() -> str:
    return format_iso(datetime.now(timezone.utc))
