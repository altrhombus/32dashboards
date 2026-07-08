import http.server
import socketserver
import threading
import time

import pytest
import requests

from scraper import client, parser


class HangingHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 -- http.server's required method name
        time.sleep(5)  # much longer than the timeout under test
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"<html></html>")

    def log_message(self, format, *args):  # noqa: A002 -- silence test server logging
        pass


@pytest.fixture
def hanging_server():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), HangingHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield httpd.server_address[1]
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_fetch_auction_items_actually_times_out_against_a_hung_server(hanging_server):
    """Legacy scrape_auction.py had no timeout on any requests.get() call --
    a hung connection could block the entire scrape loop indefinitely. This
    proves the configured timeout actually fires against a real socket that
    never responds, not just a mocked one."""
    session = requests.Session()
    start = time.monotonic()
    with pytest.raises(requests.exceptions.Timeout):
        parser.fetch_auction_items(session, f"http://127.0.0.1:{hanging_server}/", timeout=0.5)
    elapsed = time.monotonic() - start
    assert elapsed < 3.0


def test_fetch_items_with_retry_gives_up_after_exhausting_retries_against_a_hung_server(hanging_server):
    session = requests.Session()
    start = time.monotonic()
    with pytest.raises(requests.exceptions.Timeout):
        client.fetch_items_with_retry(session, f"http://127.0.0.1:{hanging_server}/", timeout=0.3)
    elapsed = time.monotonic() - start
    # 3 attempts at 0.3s each plus backoff waits, but must still terminate quickly.
    assert elapsed < 10.0


def test_fetch_items_with_retry_recovers_after_transient_connection_errors():
    calls = {"count": 0}

    class FlakyThenOkSession:
        def get(self, url, timeout=None):
            assert timeout is not None
            calls["count"] += 1
            if calls["count"] < 3:
                raise requests.ConnectionError("connection reset")
            from .fakes import FakeResponse

            return FakeResponse('<html><body><ul class="pagination"></ul></body></html>')

    items = client.fetch_items_with_retry(FlakyThenOkSession(), "https://example.test/auction", timeout=1.0)
    assert items == []
    assert calls["count"] == 3
