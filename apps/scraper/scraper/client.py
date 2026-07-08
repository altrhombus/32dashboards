from __future__ import annotations

from typing import Optional

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from . import parser


def build_session(session_cookie: Optional[str], auth_token: Optional[str]) -> requests.Session:
    session = requests.Session()
    cookies = {}
    if session_cookie:
        cookies["_session_id"] = session_cookie
    if auth_token:
        cookies["auth_token"] = auth_token
    if cookies:
        session.cookies.update(cookies)
    return session


# Legacy had no timeout and no retry at all -- a single hung connection could
# block the entire scrape loop indefinitely. This retries transient
# connection/timeout failures with backoff, then re-raises so the worker's
# per-cycle guard can log a definitive failure instead of looping silently.
_retryable = retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((requests.ConnectionError, requests.Timeout)),
)


@_retryable
def fetch_items_with_retry(session, url: str, timeout: float, on_item=None) -> list[parser.ScrapedItem]:
    return parser.fetch_auction_items(session, url, timeout, on_item=on_item)


@_retryable
def fetch_total_raised_with_retry(session, url: str, timeout: float) -> Optional[str]:
    return parser.get_total_raised_raw(session, url, timeout)
