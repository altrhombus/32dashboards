# 32dashboards
Dashboard for presenting and tracking auction data, and works in conjunction with the 32datasources project.

## Features
- Public-facing dashboard to track featured items (items with a low number of bids), causes/sponsors (cycling through logos), a countdown timer (to the end of the event), announcements (dynamically updatable from an admin panel), the total raised, incentives, and a scrolling marquee of items available for bidding.
- Backend admin panel for controlling the auction name, end time, announcements, incentives, and controlling an interactive 'ask me' mode.
- A celebratory announcement at the end of the auction showing the total amount raised.

### Ask Me mode
In this mode, the dashboard is replaced with screen including information about a cause. As bids are interactively received, the dashboard can be updated to track each bid with a celebratory animation. Ask Me bids do not count towards the total amount--this must be added separately.
When the mode is completed, a brief "thank you" prompt is displayed on the screen.

### Incentives
When an incentive is specified, an animated progress bar will appear either on-demand or after all items have scrolled across the screen. The incentive shows the name, current and target totals, and a progress bar. Incentives can appear on-demand from the admin panel and stay on-screen for 10 seconds or until the incentive is met. A brief celebratory "thank you" animation is played after the incentive is met.

## Getting Started
Open the dashboard at [http://localhost:80](http://localhost:80) or the admin page at [http://localhost:80/admin.html](http://localhost:80/admin.html).
Runs great in docker:
    ```bash
    docker compose up --build
    ```