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
  NoBidSpotlight,
  QrCode,
  MilestoneSpotlight,
  AskMeRoundWrap,
  MomentToast,
  PrizeCard,
  InlineMarkdown,
  RecentDonations,
  SponsorCarousel,
  TotalRaisedCounter,
} from "@32dashboards/ui";
import { SPONSORS_TITLE, askMeProgress, firstLink, shortenLinks } from "@32dashboards/schema/core";
import type { CelebrationMoment, InfoBarDisplay, KioskData, ToastMoment } from "./data.js";
import { selectFeaturedItems, selectNoBidItems, type SegmentContent } from "./segments.js";

/*
 * The components kiosk layouts can place. Each declares its size variants
 * and selects its own props from KioskData; layouts (layouts.ts) only say
 * where things go.
 */

/** How long each announcement stays in the Announcements block. */
const ANNOUNCEMENT_MS = 7_000;

/** When the bidding countdown starts calling attention to itself. */
const URGENT_MS = 10 * 60_000;

/** Wraps a component in a titled card when the slot's options give a title. */
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

function Segment({ content, total, recent }: { content: SegmentContent; total: number; recent: ToastMoment[] }) {
  switch (content.kind) {
    case "items":
      // Resumes where it left off, so each turn shows the next stretch of items, not the first ones again.
      return <BottomMarquee items={content.items} resumeKey="info-bar" />;
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
          <InlineMarkdown text={content.text} />
        </div>
      );
    case "recent":
      return <RecentDonations moments={recent} label="Bids" />;
    case "sponsor":
      return (
        <div className="kiosk-info-bar__logo">
          {content.title && <span className="kiosk-info-bar__logo-title clamp-1">{content.title}</span>}
          <SponsorCarousel sponsors={[content.sponsor]} background={content.background} />
        </div>
      );
  }
}

function InfoBar(props: { display: InfoBarDisplay; total: number; recent: ToastMoment[]; starring: boolean }) {
  const { display, total, recent, starring } = props;
  if (display.type === "empty") return <div className="kiosk-info-bar" />;
  if (display.type === "celebration") {
    const m = display.moment;
    return (
      <div className={`kiosk-info-bar kiosk-info-bar--celebrating${starring ? " kiosk-info-bar--starring" : ""}`}>
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
      <Segment content={display.segment.content} total={total} recent={recent} />
    </div>
  );
}

/** What a celebration says, for the spotlight and the banner. */
function celebrationText(moment: CelebrationMoment, event: KioskData["live"]["event"]) {
  if (moment.kind === "last-call") return lastCall(moment.minutesLeft, event);
  return moment.kind === "milestone"
    ? { heading: "Milestone reached", amount: moment.amount, detail: moment.label || undefined }
    : { heading: "Goal met", amount: moment.target, detail: moment.name };
}

/**
 * Whether a celebration takes over the screen, or plays in the info bar. Last
 * calls always take the screen: everyone needs to see those. So does anything
 * on a layout with no info bar to play in.
 */
export function usesSpotlight(data: Pick<KioskData, "live" | "hasInfoBar">, moment: CelebrationMoment): boolean {
  if (moment.kind === "last-call" || data.hasInfoBar === false) return true;
  const style = data.live.event?.milestoneStyle ?? "spotlight";
  if (style === "named") return moment.kind === "incentive-met" || Boolean(moment.label);
  return style === "spotlight";
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
  /** Shown when nothing else on screen says how to give. */
  callToAction: string;
  /** Where the QR code goes, if the call to action has an address. */
  giveUrl: string | null;
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
      {(props.giveUrl || props.endDateTime) && (
        <div className="kiosk-welcome__closes">
          {props.giveUrl && (
            <figure className="kiosk-welcome__qr">
              <QrCode url={props.giveUrl} label="QR code to bid or give" />
              <figcaption>Scan to bid or give</figcaption>
            </figure>
          )}
          {props.endDateTime && (
            <div className="kiosk-welcome__countdown">
              <span>Bidding closes in</span>
              <CountdownClock endDateTime={props.endDateTime} urgentMs={URGENT_MS} endedLabel="Bidding closed" />
            </div>
          )}
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

  noBidItems: defineComponent<KioskData, { items: KioskData["live"]["items"]; size: number }>({
    variants: ["spotlight"],
    select: ({ live }, { options }) => ({
      items: selectNoBidItems(live.items),
      size: typeof options.size === "number" ? options.size : 2,
    }),
    component: NoBidSpotlight,
  }),

  announcements: defineComponent<KioskData, { announcements: string[]; title?: unknown }>({
    variants: ["list"],
    select: ({ live }, { options }) =>
      live.event?.announcements.length ? { announcements: live.event.announcements, title: options.title } : null,
    component: ({ announcements, title }) => (
      <Card title={title}>
        {/* One at a time, so each can be as long as it needs at TV size. */}
        <AnnouncementsList announcements={announcements} rotateMs={ANNOUNCEMENT_MS} />
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
    {
      sponsors: NonNullable<KioskData["live"]["event"]>["sponsors"];
      title?: unknown;
      intervalMs: number;
      background: string;
    }
  >({
    variants: ["carousel"],
    select: ({ live }, { options }) =>
      live.event?.sponsors.length
        ? {
            sponsors: [...live.event.sponsors].sort((a, b) => a.sortOrder - b.sortOrder),
            // A layout's own heading wins; left at the default, the block uses the event's.
            title: options.title === SPONSORS_TITLE ? live.event.sponsorsTitle : options.title,
            // Events stored before this setting existed have none until the server upgrades them.
            intervalMs: (live.event.sponsorsSeconds || 6) * 1000,
            // The card sits on the lower part of the background, which Auto judges logos against.
            background: live.event.theme.backgroundTo,
          }
        : null,
    component: ({ sponsors, title, intervalMs, background }) => (
      <Card title={title}>
        <SponsorCarousel sponsors={sponsors} intervalMs={intervalMs} background={background} />
      </Card>
    ),
  }),

  infoBar: defineComponent<
    KioskData,
    { display: InfoBarDisplay; total: number; recent: ToastMoment[]; starring: boolean }
  >({
    variants: ["bar"],
    select: (data) => ({
      display: data.infoBar,
      total: data.live.total,
      recent: data.recent,
      // With nothing covering the screen, the bar is the whole celebration, so it puts on more of a show.
      starring: data.infoBar.type === "celebration" && !usesSpotlight(data, data.infoBar.moment),
    }),
    component: InfoBar,
  }),

  callToAction: defineComponent<KioskData, { text: string }>({
    variants: ["banner"],
    select: ({ live }) => (live.event?.callToAction ? { text: shortenLinks(live.event.callToAction) } : null),
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
    select: (data) =>
      data.infoBar.type === "celebration" && usesSpotlight(data, data.infoBar.moment)
        ? celebrationText(data.infoBar.moment, data.live.event)
        : null,
    component: MilestoneSpotlight,
  }),

  milestoneBanner: defineComponent<KioskData, Parameters<typeof MilestoneCelebration>[0]>({
    variants: ["strip"],
    select: ({ infoBar, live }) =>
      infoBar.type === "celebration" ? { ...celebrationText(infoBar.moment, live.event), confetti: false } : null,
    component: (props) => (
      <div className="kiosk-banner">
        <MilestoneCelebration {...props} />
      </div>
    ),
  }),

  welcome: defineComponent<KioskData, Parameters<typeof Welcome>[0]>({
    variants: ["hero"],
    select: ({ live }) =>
      live.event
        ? {
            name: live.event.name,
            causeName: live.event.causeName,
            logoUrl: live.event.theme.logoUrl,
            // The info bar says it too, unless the event took it out of the rotation.
            callToAction: live.event.infoBar.segments.includes("callToAction")
              ? ""
              : shortenLinks(live.event.callToAction),
            giveUrl: firstLink(live.event.callToAction),
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
