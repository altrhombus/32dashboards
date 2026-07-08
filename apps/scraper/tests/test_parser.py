from pathlib import Path

import pytest

from scraper import parser
from .fakes import FakeSession

FIXTURES = Path(__file__).parent / "fixtures"


def read_fixture(name: str) -> str:
    return (FIXTURES / name).read_text()


def test_fetch_auction_items_parses_all_fields_and_follows_pagination():
    session = FakeSession(
        {
            "https://example.test/auction": read_fixture("items_page1.html"),
            "https://example.test/auction?page=2": read_fixture("items_page2.html"),
        }
    )

    items = parser.fetch_auction_items(session, "https://example.test/auction", timeout=5.0)

    assert len(items) == 3
    assert items[0].title == "Signed Guitar"
    assert items[0].picture_url == "/images/item1.jpg"
    assert items[0].price == "$50"
    assert items[0].remaining == "2 days"
    assert items[0].value == "$100"
    assert items[0].bids == "3"
    assert items[2].title == "Weekend Cabin Stay"
    # Confirms pagination was actually followed, not just page 1 re-parsed.
    assert session.requested_urls == ["https://example.test/auction", "https://example.test/auction?page=2"]


def test_fetch_auction_items_stops_when_next_page_missing():
    session = FakeSession({"https://example.test/auction": read_fixture("items_page2.html")})
    items = parser.fetch_auction_items(session, "https://example.test/auction", timeout=5.0)
    assert len(items) == 1
    assert session.requested_urls == ["https://example.test/auction"]


def test_get_total_raised_raw_parses_the_amount():
    session = FakeSession({"https://example.test/summary": read_fixture("summary.html")})
    total = parser.get_total_raised_raw(session, "https://example.test/summary", timeout=5.0)
    assert total == "$1,234.56"


def test_get_total_raised_raw_returns_none_when_element_absent():
    session = FakeSession({"https://example.test/summary": "<html><body>no total here</body></html>"})
    total = parser.get_total_raised_raw(session, "https://example.test/summary", timeout=5.0)
    assert total is None


def test_apply_filters_excludes_matching_titles_case_insensitively():
    items = [
        parser.ScrapedItem(title="Signed Guitar"),
        parser.ScrapedItem(title="Gift Basket"),
        parser.ScrapedItem(title=None),
    ]
    kept, filtered_out = parser.apply_filters(items, ["guitar"])
    assert [i.title for i in kept] == ["Gift Basket", None]
    assert len(filtered_out) == 1
    assert filtered_out[0][0].title == "Signed Guitar"
    assert filtered_out[0][1] == "guitar"


def test_apply_filters_is_a_noop_with_no_filters():
    items = [parser.ScrapedItem(title="Signed Guitar")]
    kept, filtered_out = parser.apply_filters(items, [])
    assert kept == items
    assert filtered_out == []


def test_check_scrape_integrity_passes_for_healthy_results():
    items = [parser.ScrapedItem(title="Signed Guitar"), parser.ScrapedItem(title="Gift Basket")]
    parser.check_scrape_integrity(items)  # should not raise


def test_check_scrape_integrity_passes_for_empty_results():
    parser.check_scrape_integrity([])  # an auction with zero items is not itself suspicious


def test_check_scrape_integrity_raises_when_upstream_markup_changed():
    """Regression test: mutating the fixture's title class must fail LOUDLY,
    not silently produce empty/null fields as legacy scrape_auction.py did."""
    session = FakeSession({"https://example.test/auction": read_fixture("items_page1_mutated.html")})
    items = parser.fetch_auction_items(session, "https://example.test/auction", timeout=5.0)

    # The parser itself doesn't crash -- it just can't find titles anymore.
    assert len(items) == 2
    assert all(item.title is None for item in items)

    # But the integrity check must catch this and raise.
    with pytest.raises(parser.ScrapeIntegrityError):
        parser.check_scrape_integrity(items)
