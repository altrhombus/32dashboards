from __future__ import annotations

from typing import Callable, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from pydantic import BaseModel

# Safety cap the legacy scraper lacked -- `seen_pages` alone only prevents
# cycles, not a pathologically long (or malicious) pagination chain.
MAX_PAGES = 200


class ScrapedItem(BaseModel):
    """Mirrors packages/schema's ScrapedItemSchema exactly (including the
    snake_case picture_url) -- this is the wire contract both sides agree on."""

    title: Optional[str] = None
    picture_url: Optional[str] = None
    price: Optional[str] = None
    remaining: Optional[str] = None
    value: Optional[str] = None
    bids: Optional[str] = None


class ScrapeIntegrityError(Exception):
    """Raised when parsed results look suspiciously empty -- almost always
    means the upstream site's markup changed and our selectors no longer
    match anything. Legacy silently produced all-null items in this case;
    this makes that failure loud instead."""


def fetch_auction_items(session, start_url: str, timeout: float, on_item=None) -> list[ScrapedItem]:
    """
    Scrape all auction items from a paginated 32auctions listing page.
    Selectors are ported near-verbatim from the legacy scraper -- they're
    validated against the real site today; changing them risks introducing
    new scraping bugs in exactly the path being hardened here.
    """
    items: list[ScrapedItem] = []
    next_url: Optional[str] = start_url
    seen_pages: set[str] = set()

    while next_url and next_url not in seen_pages and len(seen_pages) < MAX_PAGES:
        seen_pages.add(next_url)
        response = session.get(next_url, timeout=timeout)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        for a in soup.select("a.item"):
            card = a.select_one(".card")
            if not card:
                continue

            img = card.select_one(".img-section img")
            picture_url = img["src"] if img and img.has_attr("src") else None

            title = None
            h5 = card.select_one("h5.text-truncate-2.narrow")
            if h5:
                title = h5.get_text(strip=True)

            price = None
            h6 = card.select_one("h6.text-truncate")
            if h6:
                price = h6.get_text(strip=True)

            remaining = value = bids = None
            for div in card.select("div.card-text.small.text-truncate.text-muted"):
                text = div.get_text(strip=True).lower()
                if text.startswith("remaining:"):
                    remaining = text.replace("remaining:", "").strip()
                elif text.startswith("value:"):
                    value = text.replace("value:", "").strip()
                elif text.startswith("bids:"):
                    bids = text.replace("bids:", "").strip()

            item = ScrapedItem(
                title=title, picture_url=picture_url, price=price, remaining=remaining, value=value, bids=bids
            )
            items.append(item)
            if on_item:
                on_item(item)

        next_link = soup.select_one('ul.pagination li.next a.page-link, ul.pagination li.next a[rel="next"]')
        if next_link and next_link.get("href"):
            next_url = urljoin(next_url, next_link["href"])
        else:
            next_url = None

    return items


def get_total_raised_raw(session, summary_url: str, timeout: float) -> Optional[str]:
    """
    Returns the raw, unparsed total-raised text (e.g. "$1,234.56"). Unlike
    legacy, this does NOT swallow exceptions -- a failure here should
    surface as a failed scrape cycle (logged, retried next cycle), not a
    silent None that looks identical to "the page just doesn't have a total".
    """
    response = session.get(summary_url, timeout=timeout)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    amt_div = soup.select_one("div.raised.amt")
    return amt_div.get_text(strip=True) if amt_div else None


def apply_filters(items: list[ScrapedItem], filters: list[str]) -> tuple[list[ScrapedItem], list[tuple[ScrapedItem, str]]]:
    active = [(f, f.lower()) for f in filters if f]
    if not active:
        return items, []

    kept: list[ScrapedItem] = []
    filtered_out: list[tuple[ScrapedItem, str]] = []
    for item in items:
        title_lower = (item.title or "").lower()
        matched = next((original for original, term in active if term in title_lower), None)
        if matched:
            filtered_out.append((item, matched))
        else:
            kept.append(item)
    return kept, filtered_out


def check_scrape_integrity(items: list[ScrapedItem]) -> None:
    """Raises ScrapeIntegrityError if every parsed item is missing a title --
    a strong signal the site's markup changed and selectors no longer match,
    rather than a legitimate empty/no-title auction state."""
    if not items:
        return
    if all(not item.title for item in items):
        raise ScrapeIntegrityError(
            f"all {len(items)} scraped items are missing a title -- upstream markup likely changed"
        )
