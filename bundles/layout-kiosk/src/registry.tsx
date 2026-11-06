import type { ReactNode } from "react";
import { defineComponent, type Registry } from "@32dashboards/layout-engine";
import {
  AnnouncementsList,
  AskMeOverlay,
  BidWarCard,
  BottomMarquee,
  CallToActionBanner,
  CountdownClock,
  FeaturedItemsGrid,
  GrandCelebrationOverlay,
  IncentiveTracker,
  KioskHeader,
  MilestoneCelebration,
  MilestoneSpotlight,
  AskMeRoundWrap,
  MomentToast,
  PrizeCard,
  SponsorCarousel,
  TotalRaisedCounter,
} from "@32dashboards/ui";
import { SPONSORS_TITLE, askMeProgress } from "@32dashboards/schema/core";
import type { InfoBarDisplay, KioskData, ToastMoment } from "./data.js";
import { selectFeaturedItems, type SegmentContent } from "./segments.js";

/*
 * The components kiosk layouts can place. Each declares its size variants
 * and selects its own props from KioskData; layouts (layouts.ts) only say
 * where things go.
 */

/** Wraps a component in a titled card when the slot's options give a title. */
/** When the bidding countdown starts calling attention to itself. */
const URGENT_MS = 10 * 60_000;

function Card({ title, children }: { title?: unknown; children: ReactNode }) {
  if (typeof title !== "string" || !title) return <div className="kiosk-card">{children}</div>;
  return (
    <section className="kiosk-card">
      <h2 className="kiosk-card__title">{title}</h2>
      {children}
    </section>
  );
}

/**
 * What the TVs say as bidding closes: a last call with the minutes left
 * (and how to give, if `event` is given), then a thank-you, with confetti.
 */
function lastCall(minutesLeft: number, event: KioskData["live"]["event"]) {
  if (minutesLeft === 0) {
    return {
      heading: "Bidding is closed",
      text: "Thank you!",
      detail: event?.causeName ? `Every bid tonight helps ${event.causeName}` : undefined,
      confetti: true,
    };
  }
  return {
    heading: "Last call",
    text: `${minutesLeft} minute${minutesLeft === 1 ? "" : "s"} left`,
    detail: event ? event.callToAction || "Get your bids in!" : undefined,
    confetti: false,
  };
}

function Segment({ content, total }: { content: SegmentContent; total: number }) {
  switch (content.kind) {
    case "items":
      return <BottomMarquee items={content.items} />;
    case "incentive":
      return <IncentiveTracker incentive={content.incentive} totalRaised={total} />;
    case "bidWar":
      return <BidWarCard bidWar={content.bidWar} />;
    case "prize":
      return <PrizeCard prize={content.prize} />;
    case "callToAction":
      return <CallToActionBanner text={content.text} />;
    case "announcement":
      return (
        <div className="kiosk-info-bar__text clamp-1" title={content.text}>
          {content.text}
        </div>
      );
    case "sponsor":
      return (
        <div className="kiosk-info-bar__logo">
          {content.title && <span className="kiosk-info-bar__logo-title clamp-1">{content.title}</span>}
          <SponsorCarousel sponsors={[content.sponsor]} />
        </div>
      );
  }
}

function InfoBar({ display, total }: { display: InfoBarDisplay; total: number }) {
  if (display.type === "empty") return <div className="kiosk-info-bar" />;
  if (display.type === "celebration") {
    const m = display.moment;
    return (
      <div className="kiosk-info-bar kiosk-info-bar--celebrating">
        {m.kind === "milestone" ? (
          <MilestoneCelebration heading="Milestone reached!" amount={m.amount} detail={m.label || undefined} />
        ) : m.kind === "incentive-met" ? (
          <MilestoneCelebration heading="Incentive met!" amount={m.target} detail={m.name} />
        ) : (
          <MilestoneCelebration {...lastCall(m.minutesLeft, null)} />
        )}
      </div>
    );
  }
  return (
    <div className={`kiosk-info-bar kiosk-info-bar--${display.segment.content.kind}`} key={display.segment.key}>
      <Segment content={display.segment.content} total={total} />
    </div>
  );
}

function Toasts({ toasts }: { toasts: ToastMoment[] }) {
  return (
    <div className="kiosk-toasts">
      {toasts.map((moment) => (
        <MomentToast key={moment.id} moment={moment} />
      ))}
    </div>
  );
}

function Welcome(props: {
  name: string;
  causeName: string;
  logoUrl: string | null;
  callToAction: string;
  endDateTime: string | null;
}) {
  return (
    <div className="kiosk-welcome">
      {props.logoUrl && <img className="kiosk-welcome__logo" src={props.logoUrl} alt="" />}
      <div className="kiosk-welcome__name clamp-2" title={props.name}>
        {props.name}
      </div>
      {props.causeName && (
        <div className="kiosk-welcome__cause clamp-2" title={props.causeName}>
          Raising money for {props.causeName}
        </div>
      )}
      {props.callToAction && (
        <div className="kiosk-welcome__cta clamp-2" title={props.callToAction}>
          {props.callToAction}
        </div>
      )}
      {props.endDateTime && (
        <div className="kiosk-welcome__closes">
          <span>Bidding closes in</span>
          <CountdownClock endDateTime={props.endDateTime} urgentMs={URGENT_MS} endedLabel="Bidding closed" />
        </div>
      )}
    </div>
  );
}

function Intermission({ message, countdownTo }: { message: string | null; countdownTo: string | null }) {
  return (
    <div className="kiosk-intermission">
      <div className="kiosk-intermission__message clamp-2" title={message ?? undefined}>
        {message || "We'll be right back"}
      </div>
      {countdownTo && (
        <div className="kiosk-intermission__countdown">
          <CountdownClock endDateTime={countdownTo} />
        </div>
      )}
    </div>
  );
}

export const kioskRegistry: Registry<KioskData> = {
  header: defineComponent<KioskData, { title: string; logoUrl: string | null }>({
    variants: ["default"],
    select: ({ live }) => ({ title: live.event?.name ?? "", logoUrl: live.event?.theme.logoUrl ?? null }),
    component: KioskHeader,
  }),

  total: defineComponent<KioskData, { total: number; causeName: string; variant: "hero" | "compact" }>({
    variants: ["hero", "compact"],
    select: ({ live }, { variant }) => ({
      total: live.total,
      causeName: live.event?.causeName ?? "",
      variant: variant as "hero" | "compact",
    }),
    component: TotalRaisedCounter,
  }),

  featuredItems: defineComponent<KioskData, { items: KioskData["live"]["items"]; size: number; title?: unknown }>({
    variants: ["grid"],
    select: ({ live }, { options }) => {
      const size = typeof options.size === "number" ? options.size : 6;
      return { items: selectFeaturedItems(live.items, size), size, title: options.title };
    },
    component: ({ items, size, title }) => (
      <Card title={title}>
        <FeaturedItemsGrid items={items} size={size} />
      </Card>
    ),
  }),

  announcements: defineComponent<KioskData, { announcements: string[]; title?: unknown }>({
    variants: ["list"],
    select: ({ live }, { options }) =>
      live.event?.announcements.length ? { announcements: live.event.announcements, title: options.title } : null,
    component: ({ announcements, title }) => (
      <Card title={title}>
        <AnnouncementsList announcements={announcements} />
      </Card>
    ),
  }),

  countdown: defineComponent<KioskData, { endDateTime: string; title?: unknown }>({
    variants: ["panel"],
    select: ({ live }, { options }) =>
      live.event?.endDateTime ? { endDateTime: live.event.endDateTime, title: options.title } : null,
    component: ({ endDateTime, title }) => (
      <Card title={title}>
        <CountdownClock endDateTime={endDateTime} urgentMs={URGENT_MS} endedLabel="Bidding closed" />
      </Card>
    ),
  }),

  sponsors: defineComponent<
    KioskData,
    { sponsors: NonNullable<KioskData["live"]["event"]>["sponsors"]; title?: unknown }
  >({
    variants: ["carousel"],
    select: ({ live }, { options }) =>
      live.event?.sponsors.length
        ? {
            sponsors: [...live.event.sponsors].sort((a, b) => a.sortOrder - b.sortOrder),
            // A layout's own heading wins; left at the default, the block uses the event's.
            title: options.title === SPONSORS_TITLE ? live.event.sponsorsTitle : options.title,
          }
        : null,
    component: ({ sponsors, title }) => (
      <Card title={title}>
        <SponsorCarousel sponsors={sponsors} />
      </Card>
    ),
  }),

  infoBar: defineComponent<KioskData, { display: InfoBarDisplay; total: number }>({
    variants: ["bar"],
    select: ({ infoBar, live }) => ({ display: infoBar, total: live.total }),
    component: InfoBar,
  }),

  callToAction: defineComponent<KioskData, { text: string }>({
    variants: ["banner"],
    select: ({ live }) => (live.event?.callToAction ? { text: live.event.callToAction } : null),
    component: CallToActionBanner,
  }),

  toasts: defineComponent<KioskData, { toasts: ToastMoment[] }>({
    variants: ["stack"],
    select: ({ toasts }) => (toasts.length ? { toasts } : null),
    component: Toasts,
  }),

  milestoneSpotlight: defineComponent<KioskData, Parameters<typeof MilestoneSpotlight>[0]>({
    variants: ["full"],
    // Shown while the info bar celebrates, so both start and end together.
    select: ({ infoBar, live }) => {
      if (infoBar.type !== "celebration") return null;
      const m = infoBar.moment;
      if (m.kind === "last-call") return lastCall(m.minutesLeft, live.event);
      return m.kind === "milestone"
        ? { heading: "Milestone reached", amount: m.amount, detail: m.label || undefined }
        : { heading: "Goal met", amount: m.target, detail: m.name };
    },
    component: MilestoneSpotlight,
  }),

  welcome: defineComponent<KioskData, Parameters<typeof Welcome>[0]>({
    variants: ["hero"],
    select: ({ live }) =>
      live.event
        ? {
            name: live.event.name,
            causeName: live.event.causeName,
            logoUrl: live.event.theme.logoUrl,
            callToAction: live.event.callToAction,
            endDateTime: live.event.endDateTime,
          }
        : null,
    component: Welcome,
  }),

  askMeWrap: defineComponent<KioskData, Parameters<typeof AskMeRoundWrap>[0]>({
    variants: ["full"],
    select: ({ roundWrap, live }) =>
      roundWrap
        ? {
            title: roundWrap.title || live.event?.askMe.title || "Ask Me",
            amount: roundWrap.amount,
            number: roundWrap.number,
            count: roundWrap.count,
            raisedTonight: roundWrap.raisedTonight,
          }
        : null,
    component: AskMeRoundWrap,
  }),

  intermission: defineComponent<KioskData, { message: string | null; countdownTo: string | null }>({
    variants: ["hero"],
    select: ({ scene }) => ({ message: scene.message, countdownTo: scene.countdownTo }),
    component: Intermission,
  }),

  askMe: defineComponent<
    KioskData,
    { askMe: NonNullable<KioskData["live"]["event"]>["askMe"]; logoUrl: string | null; kicker?: string }
  >({
    variants: ["full"],
    select: ({ live }) => {
      const event = live.event;
      if (!event) return null;
      const progress = askMeProgress(event);
      // With a plan, the round on now; after the last one, tonight's thanks.
      const askMe = progress.done
        ? {
            ...event.askMe,
            title: "Thank you!",
            message: "Every Ask Me round tonight, together:",
            total: event.askMeRaised,
          }
        : { ...event.askMe, title: progress.title, message: progress.message };
      return {
        askMe,
        logoUrl: event.theme.logoUrl,
        kicker: progress.count && !progress.done ? `Ask Me ${progress.number} of ${progress.count}` : undefined,
      };
    },
    component: ({ askMe, logoUrl, kicker }) => <AskMeOverlay askMe={askMe} logoUrl={logoUrl} kicker={kicker} visible />,
  }),

  grandCelebration: defineComponent<KioskData, { totalRaised: number; causeName: string; logoUrl: string | null }>({
    variants: ["full"],
    select: ({ live }) => ({
      totalRaised: live.total,
      causeName: live.event?.causeName ?? "",
      logoUrl: live.event?.theme.logoUrl ?? null,
    }),
    component: ({ totalRaised, causeName, logoUrl }) => (
      <GrandCelebrationOverlay active totalRaised={totalRaised} causeName={causeName} logoUrl={logoUrl} />
    ),
  }),

  standby: defineComponent<KioskData, object>({
    variants: ["full"],
    select: () => ({}),
    component: () => <div className="kiosk-standby">Starting soon</div>,
  }),
};
