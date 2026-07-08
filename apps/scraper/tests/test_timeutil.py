import re
from datetime import datetime, timedelta, timezone

from scraper.timeutil import format_iso, utc_now_iso

# Matches the exact format zod's z.string().datetime() accepts by default:
# Z-suffixed UTC, no offset. Python's datetime.isoformat() instead emits a
# "+00:00" offset for UTC, which zod rejects -- caught via a live integration
# test (scraper -> real API), not by any unit test in isolation.
ZOD_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def test_utc_now_iso_matches_the_format_the_api_schema_requires():
    value = utc_now_iso()
    assert ZOD_DATETIME_RE.match(value), f"{value!r} does not match zod's expected datetime format"


def test_format_iso_converts_non_utc_input_to_utc():
    eastern = timezone(timedelta(hours=-5))
    dt = datetime(2026, 1, 1, 12, 0, 0, tzinfo=eastern)
    assert format_iso(dt) == "2026-01-01T17:00:00.000Z"
