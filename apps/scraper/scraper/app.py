from __future__ import annotations

from functools import wraps

from flask import Flask, jsonify, request

from .config import Settings
from .state import ScraperState, ScrapeTarget


def create_app(settings: Settings, state: ScraperState) -> Flask:
    app = Flask(__name__)

    def require_control_token(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if header != f"Bearer {settings.control_token}":
                return jsonify({"error": "invalid control token"}), 401
            return fn(*args, **kwargs)

        return wrapper

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/status")
    @require_control_token
    def status():
        return jsonify(state.status_snapshot())

    @app.get("/logs")
    @require_control_token
    def logs():
        return jsonify(state.get_logs())

    @app.post("/config")
    @require_control_token
    def set_config():
        """Body uses the same camelCase field names as packages/schema's
        ScraperSourceSchema -- apps/api forwards an event's scraperSource
        here verbatim whenever it's activated or edited."""
        body = request.get_json(force=True, silent=True) or {}
        try:
            target = ScrapeTarget(
                org_id=body["orgId"],
                auction_id=body["auctionId"],
                friendly_auction_path=body["friendlyAuctionPath"],
                session_cookie=body.get("sessionCookie"),
                auth_token=body.get("authToken"),
                refresh_interval_seconds=body.get("refreshIntervalSeconds", 10),
                filters=body.get("filters", []),
            )
        except (KeyError, TypeError, ValueError) as exc:
            return jsonify({"error": f"invalid config: {exc}"}), 400
        state.set_target(target)
        state.request_refresh_now()
        return jsonify({"ok": True})

    @app.post("/refresh")
    @require_control_token
    def refresh():
        body = request.get_json(force=True, silent=True) or {}
        action = body.get("state")
        if action == "pause":
            state.set_paused(True)
        elif action == "resume":
            state.set_paused(False)
        elif action == "now":
            state.request_refresh_now()
        else:
            return jsonify({"error": "state must be one of: pause, resume, now"}), 400
        return jsonify({"ok": True})

    @app.post("/filters")
    @require_control_token
    def set_filters():
        body = request.get_json(force=True, silent=True) or {}
        keywords = body.get("keywords")
        if not isinstance(keywords, list) or not all(isinstance(k, str) for k in keywords):
            return jsonify({"error": "keywords must be an array of strings"}), 400
        state.set_filters(keywords)
        return jsonify({"ok": True})

    @app.post("/adjustment")
    @require_control_token
    def set_adjustment():
        body = request.get_json(force=True, silent=True) or {}
        try:
            amount = float(body.get("amount", 0))
        except (TypeError, ValueError):
            return jsonify({"error": "amount must be a number"}), 400
        state.set_adjustment(amount)
        return jsonify({"ok": True})

    return app
