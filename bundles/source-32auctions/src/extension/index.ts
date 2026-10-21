import type NodeCG from "nodecg/types";
import { createPollingSource } from "@32dashboards/source-sdk";
import { ConfigSchema, DEFAULT_BASE_URL, SECRET_KEYS, SOURCE_ID } from "../config.js";
import { createSessionPoller } from "./session.js";

/**
 * Polls 32auctions for the active event when that event's source is
 * "32auctions". Settings and credentials are per event, edited in this
 * bundle's panel; with an organizer email and password it signs in by itself
 * (session.ts). `baseUrl` in cfg/source-32auctions.json overrides the site, for
 * testing against a local copy.
 */
export default function source32auctions(nodecg: NodeCG.ServerAPI) {
  const bundleConfig = (nodecg.bundleConfig ?? {}) as { baseUrl?: string };
  const baseUrl = (bundleConfig.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  createPollingSource(nodecg, {
    id: SOURCE_ID,
    label: "32auctions",
    configSchema: ConfigSchema,
    secretKeys: SECRET_KEYS,
    intervalSeconds: (config) => config.refreshIntervalSeconds,
    poll: createSessionPoller({ baseUrl }),
  });
}
