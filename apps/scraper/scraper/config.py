from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Deployment-level config (env vars, set once at container start). The
    *scrape target* (org/auction IDs, cookies, refresh interval, filters) is
    deliberately NOT here -- it's runtime-mutable via POST /config, stored in
    state.ScraperState, so a new event can be scraped without a redeploy.
    This is the fix for legacy scrape_auction.py baking org/auction IDs and
    session cookies into the Docker image at build time.
    """

    model_config = SettingsConfigDict(extra="ignore")

    api_base_url: str = "http://api:8090"
    internal_token: str
    control_token: str
    host: str = "0.0.0.0"
    port: int = 8081
    request_timeout_seconds: float = 10.0
    # Overridable so integration tests can point the scraper at a local fake
    # server instead of the real site.
    target_base_url: str = "https://www.32auctions.com"
