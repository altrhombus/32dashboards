import type { DonationMoment, LiveStateReplicant, SceneReplicant } from "@32dashboards/schema/core";
import type { Segment } from "./segments.js";

export type ToastMoment = Extract<DonationMoment, { kind: "total-increase" | "new-bid" }>;
export type CelebrationMoment = Extract<DonationMoment, { kind: "milestone" | "incentive-met" }>;

/** What info bar shows right now. */
export type InfoBarDisplay =
  { type: "segment"; segment: Segment } | { type: "celebration"; moment: CelebrationMoment } | { type: "empty" };

/** Everything kiosk layouts select their components' props from. */
export interface KioskData {
  live: LiveStateReplicant;
  scene: SceneReplicant;
  infoBar: InfoBarDisplay;
  toasts: ToastMoment[];
}
