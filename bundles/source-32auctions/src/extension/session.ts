import { HttpError, type PollContext, type PollResult } from "@32dashboards/source-sdk";
import type { Config } from "../config.js";
import { TotalNotShownError, scrapeAuction, type ScrapeOptions } from "./scrape.js";
import { SignInError, credentialFingerprint, signIn, type Cookies, type SignInOptions } from "./signin.js";

export interface SessionOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  scrape?: (options: ScrapeOptions) => Promise<PollResult>;
  signInImpl?: (options: SignInOptions) => Promise<Cookies>;
}

/**
 * Polls with automatic sign-in. When the event's panel has an organizer
 * email and password, the source signs in before it first needs the hidden
 * total, keeps the session in memory, and signs in again when the site stops
 * accepting it (401/403, or the total disappears). A pair that was turned
 * down isn't tried again until it changes, so a wrong password can't lock
 * the account. Without an email and password, pasted cookies are used as
 * before.
 */
export function createSessionPoller(options: SessionOptions) {
  const { baseUrl, fetchImpl, scrape = scrapeAuction, signInImpl = signIn } = options;
  const sessions = new Map<string, Cookies>();
  const failures = new Map<string, { fingerprint: string; message: string }>();

  return async function poll(context: PollContext<Config>): Promise<PollResult> {
    const { eventId, config, secrets, signal, log } = context;
    const email = secrets.email?.trim() ?? "";
    const password = secrets.password ?? "";
    const fingerprint = email && password ? credentialFingerprint(email, password) : null;
    const failure = failures.get(eventId);
    const blocked = Boolean(fingerprint && failure?.fingerprint === fingerprint);

    const fetchWith = (cookies: Cookies | undefined) =>
      scrape({ config, secrets, cookies, signal, baseUrl, fetchImpl });

    const signInNow = async (): Promise<Cookies> => {
      try {
        const cookies = await signInImpl({ baseUrl, email, password, signal, fetchImpl });
        sessions.set(eventId, cookies);
        failures.delete(eventId);
        log("info", "Signed in to 32auctions");
        return cookies;
      } catch (err) {
        if (err instanceof SignInError) failures.set(eventId, { fingerprint: fingerprint!, message: err.message });
        throw err;
      }
    };

    if (!fingerprint) return fetchWith(undefined);
    if (blocked) {
      // Don't retry a pair that was turned down; use pasted cookies if there are any.
      return fetchWith(undefined).catch((err: unknown) => {
        throw new Error(`${failure!.message} (${err instanceof Error ? err.message : String(err)})`);
      });
    }

    let cookies = sessions.get(eventId);
    let fresh = false;
    if (!cookies && config.totalFrom === "page") {
      cookies = await signInNow();
      fresh = true;
    }
    try {
      return await fetchWith(cookies);
    } catch (err) {
      const signedOut =
        err instanceof TotalNotShownError || (err instanceof HttpError && (err.status === 401 || err.status === 403));
      if (!signedOut) throw err;
      if (fresh) {
        throw new Error(
          "Signed in, but the auction page still doesn't show the total. Is this the organizer account for this auction?",
        );
      }
      sessions.delete(eventId);
      log("info", "The 32auctions session ended; signing in again");
      return fetchWith(await signInNow());
    }
  };
}
