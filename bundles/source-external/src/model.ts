import { z } from "zod";
import { SourceResultSchema } from "@32dashboards/schema/core";

export const SOURCE_ID = "external";
export const BUNDLE = "source-external";
/** Where results are POSTed, relative to the NodeCG server. */
export const PUSH_PATH = `/${BUNDLE}/results`;

/**
 * The body a pushing process sends: one observation for one event, in the
 * same normalized shape every adapter reports. `observedAt` defaults to the
 * time the request arrives.
 */
export const PushBodySchema = SourceResultSchema.omit({ sourceId: true })
  .extend({ observedAt: SourceResultSchema.shape.observedAt.optional() })
  .strict();
export type PushBody = z.input<typeof PushBodySchema>;

/** Replicant `endpoint` (persisted): what panels show. Never contains the token. */
export const EndpointReplicantSchema = z.object({
  path: z.string(),
  tokenCreatedAt: z.string().datetime({ offset: true }).nullable(),
  lastPushAt: z.string().datetime({ offset: true }).nullable(),
});
export type EndpointReplicant = z.infer<typeof EndpointReplicantSchema>;
