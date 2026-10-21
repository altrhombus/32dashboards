import type NodeCG from "nodecg/types";
import { CommandError, createPollingSource, listenForCommand } from "@32dashboards/source-sdk";
import { ConfigSchema, DEFAULT_BASE_URL, SECRET_KEYS, SOURCE_ID, auctionMessageSchemas } from "../config.js";
import { LookupError, lookupAuction } from "./lookup.js";
import { createSessionPoller } from "./session.js";
import { SignInError } from "./signin.js";

/** How many items with photos a connection test shows back. */
const SAMPLE_SIZE = 8;

/**
 * Polls 32auctions for the active event when that event's source is
 * "32auctions". Settings and credentials are per event, edited in this
 * bundle's panel; with an organizer email and password it signs in by itself
 * (session.ts). `baseUrl` in cfg/source-32auctions.json overrides the site, for
 * testing against a local copy.
 *
 * Two Messages help set an event up: `lookupAuction` turns a pasted public
 * link into settings (and the auction's title and organization), and
 * `testConnection` fetches once for an event and says what it found, without
 * the total itself.
 */
export default function source32auctions(nodecg: NodeCG.ServerAPI) {
  const bundleConfig = (nodecg.bundleConfig ?? {}) as { baseUrl?: string };
  const baseUrl = (bundleConfig.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  const source = createPollingSource(nodecg, {
    id: SOURCE_ID,
    label: "32auctions",
    configSchema: ConfigSchema,
    secretKeys: SECRET_KEYS,
    intervalSeconds: (config) => config.refreshIntervalSeconds,
    poll: createSessionPoller({ baseUrl }),
  });

  const readable = (err: unknown) =>
    err instanceof LookupError || err instanceof SignInError || err instanceof Error
      ? new CommandError(err.message)
      : new CommandError(String(err));

  listenForCommand(nodecg, "lookupAuction", auctionMessageSchemas.lookupAuction, ({ url }) =>
    lookupAuction(url, { baseUrl, signal: AbortSignal.timeout(20_000) }).catch((err: unknown) => {
      throw readable(err);
    }),
  );

  listenForCommand(nodecg, "testConnection", auctionMessageSchemas.testConnection, async ({ eventId }) => {
    const config = source.settings.getConfig(eventId);
    try {
      const { result, outcome } = await source.runOnce(eventId);
      const items = result.items ?? [];
      const withPhotos = items.filter((i) => i.imageUrl);
      return {
        stored: outcome === "stored",
        itemCount: items.length,
        photoCount: withPhotos.length,
        // Whether the total came through, never the amount: the person testing may not be the one to see it.
        total: config?.totalFrom === "page" ? "visible" : config?.totalFrom === "bids" ? "from-bids" : "not-shown",
        samples: withPhotos.slice(0, SAMPLE_SIZE).map(({ title, imageUrl }) => ({ title, imageUrl })),
      };
    } catch (err) {
      throw readable(err);
    }
  });
}
