import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

/*
 * Signs in to 32auctions the way a browser does, so the source can read a
 * total the auction hides from the public. The sign-in page is a plain form
 * (email, password, and a CSRF `authenticity_token`) that sets session
 * cookies. Accounts that use "Sign in with Google" can't do this; they paste
 * cookies instead.
 */

/** A sign-in that won't work until the email or password changes (wrong password, a new captcha…). */
export class SignInError extends Error {
  override name = "SignInError";
}

export type Cookies = Record<string, string>;

/** Adds a response's Set-Cookie headers to a cookie jar (name -> value), dropping deleted ones. */
export function mergeCookies(jar: Cookies, response: Response): Cookies {
  const next = { ...jar };
  for (const header of response.headers.getSetCookie()) {
    const [pair = "", ...attributes] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attributes.some((a) => {
      const [key, val = ""] = a.split("=").map((s) => s.trim().toLowerCase());
      return (key === "max-age" && Number(val) <= 0) || (key === "expires" && Date.parse(val) < Date.now());
    });
    if (expired || value === "") delete next[name];
    else next[name] = value;
  }
  return next;
}

const header = (jar: Cookies) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

export interface SignInOptions {
  baseUrl: string;
  email: string;
  password: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Signs in and returns the session's cookies. Throws SignInError when the site turns it down. */
export async function signIn(options: SignInOptions): Promise<Cookies> {
  const { baseUrl, email, password, fetchImpl = fetch, timeoutMs = 15_000 } = options;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  const page = await fetchImpl(`${baseUrl}/login`, { signal, redirect: "manual" });
  if (!page.ok) throw new Error(`HTTP ${page.status} from the 32auctions sign-in page`);
  let jar = mergeCookies({}, page);
  const $ = cheerio.load(await page.text());
  const form = $('form[action*="login_post"]').first();
  const token =
    form.find('input[name="authenticity_token"]').attr("value") ?? $('meta[name="csrf-token"]').attr("content");
  if (!form.length || !token) {
    throw new SignInError(
      "The 32auctions sign-in page changed, so signing in automatically stopped working. Paste cookies instead.",
    );
  }
  const action = new URL(form.attr("action")!, `${baseUrl}/login`).href;

  const response = await fetchImpl(action, {
    method: "POST",
    signal,
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: header(jar), referer: `${baseUrl}/login` },
    body: new URLSearchParams({ authenticity_token: token, email, password, commit: "Login" }).toString(),
  });
  jar = mergeCookies(jar, response);

  // A successful sign-in redirects away from the login page; a failed one shows it again.
  const location = response.headers.get("location") ?? "";
  const redirected = response.status >= 300 && response.status < 400;
  if (!redirected || /\/login(\b|_post|$)/.test(new URL(location, baseUrl).pathname)) {
    const body = redirected ? "" : await response.text();
    const alert = cheerio.load(body)(".alert, .flash, .error, .invalid-feedback").first().text().trim();
    throw new SignInError(
      `32auctions didn't accept the sign-in${alert ? `: "${alert.slice(0, 120)}"` : ""}. Check the organizer email and password.`,
    );
  }
  if (!jar._session_id && !jar.auth_token) {
    throw new SignInError("32auctions signed in but set no session cookie; paste cookies instead.");
  }
  return jar;
}

/** Identifies an email and password without keeping them, to remember which pair failed. */
export function credentialFingerprint(email: string, password: string): string {
  return createHash("sha256").update(`${email}\u0000${password}`).digest("hex");
}
