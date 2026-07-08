import pytest

from scraper.app import create_app
from scraper.config import Settings
from scraper.state import ScraperState

CONTROL_TOKEN = "test-control-token"
AUTH_HEADER = {"Authorization": f"Bearer {CONTROL_TOKEN}"}


@pytest.fixture
def client():
    settings = Settings(internal_token="test-internal-token", control_token=CONTROL_TOKEN)
    state = ScraperState()
    app = create_app(settings, state)
    app.config.update(TESTING=True)
    with app.test_client() as test_client:
        yield test_client


def test_health_requires_no_auth(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.get_json() == {"ok": True}


def test_status_rejects_missing_or_wrong_token(client):
    assert client.get("/status").status_code == 401
    assert client.get("/status", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_status_succeeds_with_correct_token(client):
    res = client.get("/status", headers=AUTH_HEADER)
    assert res.status_code == 200
    body = res.get_json()
    assert body["paused"] is False
    assert body["target"]["org_id"] == ""


def test_set_config_updates_target_and_triggers_immediate_refresh(client):
    res = client.post(
        "/config",
        json={
            "orgId": "org1",
            "auctionId": "auc1",
            "friendlyAuctionPath": "my-auction",
            "sessionCookie": "secret-session",
            "authToken": "secret-token",
            "refreshIntervalSeconds": 15,
            "filters": ["raffle"],
        },
        headers=AUTH_HEADER,
    )
    assert res.status_code == 200

    status = client.get("/status", headers=AUTH_HEADER).get_json()
    assert status["target"]["org_id"] == "org1"
    assert status["target"]["auction_id"] == "auc1"
    assert status["target"]["refresh_interval_seconds"] == 15
    assert status["target"]["filters"] == ["raffle"]
    # Secrets must never appear in the status payload.
    assert "session_cookie" not in status["target"]
    assert "auth_token" not in status["target"]


def test_set_config_rejects_missing_required_fields(client):
    res = client.post("/config", json={"orgId": "org1"}, headers=AUTH_HEADER)
    assert res.status_code == 400


def test_refresh_pause_and_resume(client):
    assert client.post("/refresh", json={"state": "pause"}, headers=AUTH_HEADER).status_code == 200
    assert client.get("/status", headers=AUTH_HEADER).get_json()["paused"] is True

    assert client.post("/refresh", json={"state": "resume"}, headers=AUTH_HEADER).status_code == 200
    assert client.get("/status", headers=AUTH_HEADER).get_json()["paused"] is False


def test_refresh_rejects_invalid_state(client):
    res = client.post("/refresh", json={"state": "sideways"}, headers=AUTH_HEADER)
    assert res.status_code == 400


def test_set_filters_replaces_the_list(client):
    res = client.post("/filters", json={"keywords": ["gift card", "raffle"]}, headers=AUTH_HEADER)
    assert res.status_code == 200
    status = client.get("/status", headers=AUTH_HEADER).get_json()
    assert status["target"]["filters"] == ["gift card", "raffle"]


def test_set_adjustment(client):
    res = client.post("/adjustment", json={"amount": 42.5}, headers=AUTH_HEADER)
    assert res.status_code == 200
    status = client.get("/status", headers=AUTH_HEADER).get_json()
    assert status["manualAdjustment"] == 42.5
