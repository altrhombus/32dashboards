import type { DonationMoment, LiveStateReplicant, SceneReplicant } from "@32dashboards/schema/core";
import type { Segment } from "./segments.js";

export type ToastMoment = Extract<DonationMoment, { kind: "total-increase" | "new-bid" }>;
export type CelebrationMoment = Extract<DonationMoment, { kind: "milestone" | "incentive-met" | "last-call" }>;
export type RoundWrapMoment = Extract<DonationMoment, { kind: "askme-round" }>;
export type LiveSoldMoment = Extract<DonationMoment, { kind: "live-sold" }>;

/** What info bar shows right now. */
export type InfoBarDisplay =
  { type: "segment"; segment: Segment } | { type: "celebration"; moment: CelebrationMoment } | { type: "empty" };

/** Everything kiosk layouts select their components' props from. */
export interface KioskData {
  live: LiveStateReplicant;
  scene: SceneReplicant;
  infoBar: InfoBarDisplay;
  toasts: ToastMoment[];
  /** An Ask Me round that just finished, while its wrap-up is on screen. */
  roundWrap: RoundWrapMoment | null;
  /** A live auction item that just sold, while its SOLD stamp is on screen. */
  sold?: LiveSoldMoment | null;
  /** The latest bids and donations, newest first, for the info bar's Latest bids. */
  recent: ToastMoment[];
  /** False when this layout has no info bar, so a celebration can't play there. */
  hasInfoBar?: boolean;
}
