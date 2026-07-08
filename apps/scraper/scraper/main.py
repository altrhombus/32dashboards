from __future__ import annotations

import logging
import threading

from waitress import serve

from .app import create_app
from .config import Settings
from .state import ScraperState
from .worker import worker_loop


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    settings = Settings()
    state = ScraperState()
    app = create_app(settings, state)

    stop_event = threading.Event()
    worker_thread = threading.Thread(target=worker_loop, args=(settings, state, stop_event), daemon=True)
    worker_thread.start()

    try:
        serve(app, host=settings.host, port=settings.port)
    finally:
        stop_event.set()


if __name__ == "__main__":
    main()
