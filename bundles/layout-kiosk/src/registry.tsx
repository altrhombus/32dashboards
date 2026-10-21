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
  MomentToast,
  PrizeCard,
  SponsorCarousel,
  TotalRaisedCounter,
} from "@32dashboards/ui";
import type { InfoBarDisplay, KioskData, ToastMoment } from "./data.js";
import { selectFeaturedItems, type SegmentContent } from "./segments.js";

/*
 * The components kiosk layouts can place. Each declares its size variants
 * and selects its own props from KioskData; layouts (layouts.ts) only say
 * where things go.
 */

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
      return <SponsorCarousel sponsors={[content.sponsor]} />;
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
        ) : (
          <MilestoneCelebration heading="Incentive met!" amount={m.target} detail={m.name} />
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
    select: ({ live }, { options }) => ({
      items: selectFeaturedItems(live.items),
      size: typeof options.size === "number" ? options.size : 6,
      title: options.title,
    }),
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
        <CountdownClock endDateTime={endDateTime} />
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
        ? { sponsors: [...live.event.sponsors].sort((a, b) => a.sortOrder - b.sortOrder), title: options.title }
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

  intermission: defineComponent<KioskData, { message: string | null; countdownTo: string | null }>({
    variants: ["hero"],
    select: ({ scene }) => ({ message: scene.message, countdownTo: scene.countdownTo }),
    component: Intermission,
  }),

  askMe: defineComponent<KioskData, { askMe: NonNullable<KioskData["live"]["event"]>["askMe"] }>({
    variants: ["full"],
    select: ({ live }) => (live.event ? { askMe: live.event.askMe } : null),
    component: ({ askMe }) => <AskMeOverlay askMe={askMe} visible />,
  }),

  grandCelebration: defineComponent<KioskData, { totalRaised: number; causeName: string }>({
    variants: ["full"],
    select: ({ live }) => ({ totalRaised: live.total, causeName: live.event?.causeName ?? "" }),
    component: ({ totalRaised, causeName }) => (
      <GrandCelebrationOverlay active totalRaised={totalRaised} causeName={causeName} />
    ),
  }),

  standby: defineComponent<KioskData, object>({
    variants: ["full"],
    select: () => ({}),
    component: () => <div className="kiosk-standby">Starting soon</div>,
  }),
};
