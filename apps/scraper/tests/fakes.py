from __future__ import annotations

import requests


class FakeResponse:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"status {self.status_code}")


class FakeSession:
    """Minimal stand-in for requests.Session -- avoids pulling in a mocking
    library dependency just for canned HTML responses. Asserts callers
    always pass an explicit timeout, catching a regression where that
    got dropped."""

    def __init__(self, pages: dict[str, str]):
        self.pages = pages
        self.requested_urls: list[str] = []

    def get(self, url: str, timeout: float | None = None):
        assert timeout is not None, "caller must pass an explicit timeout"
        self.requested_urls.append(url)
        if url not in self.pages:
            raise requests.ConnectionError(f"unexpected url requested: {url}")
        return FakeResponse(self.pages[url])
