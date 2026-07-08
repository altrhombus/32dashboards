import { useState } from "react";
import {
  AnnouncementsList,
  AskMeOverlay,
  BottomMarquee,
  CountdownClock,
  FeaturedItemsGrid,
  GrandCelebrationOverlay,
  IncentiveCelebrationOverlay,
  IncentiveTracker,
  KioskHeader,
  SponsorCarousel,
  ThemeProvider,
  TotalRaisedCounter,
} from "@32dashboards/ui";
import type { Incentive, ScrapedItem } from "@32dashboards/schema";
import { useLiveAuctionState } from "./hooks/useLiveAuctionState.js";
import { useIncentiveMachine } from "./hooks/useIncentiveMachine.js";
import "./App.css";

const SSE_URL = "/events";

// Stable reference: `config?.incentives ?? []` would allocate a new empty
// array every render until config loads, which retriggers
// useIncentiveMachine's effect (and its send()) every render -> infinite
// re-render loop. Caught via live browser testing, not typecheck/unit tests.
const EMPTY_INCENTIVES: Incentive[] = [];

/**
 * "Featured" means low-bid, valued items -- kept here (app layer) rather
 * than in packages/ui because it's a domain business rule, not a
 * presentational concern. Falls back to showing all items if none qualify,
 * matching legacy main.js behavior.
 */
function selectFeaturedItems(items: ScrapedItem[]): ScrapedItem[] {
  const qualifying = items.filter((item) => {
    if (item.value === null) return false;
    const bids = item.bids !== null ? Number.parseInt(item.bids, 10) : 0;
    return Number.isFinite(bids) && bids >= 0 && bids <= 2;
  });
  return qualifying.length > 0 ? qualifying : items;
}

export function App() {
  const { config, auctionState } = useLiveAuctionState(SSE_URL);
  const [grandCelebrationActive, setGrandCelebrationActive] = useState(false);

  const totalRaised = auctionState?.totalRaised ?? 0;
  const { currentIncentive, isCelebrating, celebrationStage, onMarqueeCycleComplete } = useIncentiveMachine(
    config?.incentives ?? EMPTY_INCENTIVES,
    totalRaised
  );

  if (!config) {
    return <div className="app-loading">Waiting for event configuration…</div>;
  }

  if (config.askMe.enabled) {
    return (
      <ThemeProvider theme={config.theme}>
        <AskMeOverlay askMe={config.askMe} />
      </ThemeProvider>
    );
  }

  const items = auctionState?.items ?? [];

  return (
    <ThemeProvider theme={config.theme}>
      <div className="app-shell">
        <KioskHeader title={config.name} />
        <main className="app-main">
          <section className="app-featured">
            <h2>Featured Items</h2>
            <FeaturedItemsGrid items={selectFeaturedItems(items)} />
          </section>
          <aside className="app-sidebar">
            <section className="app-panel">
              <h2>Announcements</h2>
              <AnnouncementsList announcements={config.announcements} />
            </section>
            <section className="app-panel">
              <CountdownClock endDateTime={config.endDateTime} onExpire={() => setGrandCelebrationActive(true)} />
            </section>
            <section className="app-panel">
              <SponsorCarousel sponsors={config.sponsors} />
            </section>
          </aside>
        </main>
        <footer className="app-footer">
          <div className="app-footer__scroller">
            {isCelebrating && celebrationStage && currentIncentive ? (
              <IncentiveCelebrationOverlay incentive={currentIncentive} stage={celebrationStage} />
            ) : currentIncentive ? (
              <IncentiveTracker incentive={currentIncentive} totalRaised={totalRaised} />
            ) : (
              <BottomMarquee items={items} onCycleComplete={onMarqueeCycleComplete} />
            )}
          </div>
          <TotalRaisedCounter total={totalRaised} causeName={config.causeName} />
        </footer>
      </div>
      <GrandCelebrationOverlay active={grandCelebrationActive} totalRaised={totalRaised} causeName={config.causeName} />
    </ThemeProvider>
  );
}
