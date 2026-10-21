import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@32dashboards/source-sdk";
import type { Config } from "../src/config.js";
import { TotalNotShownError } from "../src/extension/scrape.js";
import { createSessionPoller } from "../src/extension/session.js";
import { SignInError, mergeCookies, signIn } from "../src/extension/signin.js";

const BASE = "https://example.test";
const EMAIL = "organizer@example.test";
const PASSWORD = "correct horse";

const LOGIN_PAGE = `<html><head><meta name="csrf-token" content="meta-token"></head><body>
  <form action="${BASE}/login_post" accept-charset="UTF-8" method="post">
    <input type="email" name="email" /><input type="hidden" name="authenticity_token" value="form-token" />
    <input type="password" name="password" /><input type="submit" name="commit" value="Login" />
  </form></body></html>`;

/** A stand-in for the 32auctions sign-in: a form with a CSRF token, cookies, and a redirect on success. */
function fakeLogin(options: { loginPage?: string } = {}) {
  const posts: { body: string; cookie: string }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (url === `${BASE}/login`) {
      return new Response(options.loginPage ?? LOGIN_PAGE, {
        headers: [["set-cookie", "_session_id=anon; path=/; HttpOnly"]],
      });
    }
    if (url === `${BASE}/login_post`) {
      const body = String(init?.body);
      posts.push({ body, cookie: (init?.headers as Record<string, string>).cookie ?? "" });
      const params = new URLSearchParams(body);
      if (params.get("password") === PASSWORD && params.get("authenticity_token") === "form-token") {
        return new Response(null, {
          status: 302,
          headers: [
            ["location", `${BASE}/organizations`],
            ["set-cookie", "_session_id=signed-in; path=/; HttpOnly"],
            ["set-cookie", "auth_token=tok; path=/; HttpOnly"],
          ],
        });
      }
      return new Response(`<div class="alert alert-danger">Invalid email or password</div>${LOGIN_PAGE}`, {
        status: 200,
      });
    }
    throw new TypeError(`unexpected url ${url}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, posts };
}

describe("signIn", () => {
  it("posts the form with its token and the page's cookie, and returns the session cookies", async () => {
    const site = fakeLogin();
    const cookies = await signIn({ baseUrl: BASE, email: EMAIL, password: PASSWORD, fetchImpl: site.fetchImpl });
    expect(cookies).toEqual({ _session_id: "signed-in", auth_token: "tok" });
    expect(site.posts[0]?.cookie).toBe("_session_id=anon");
    expect(new URLSearchParams(site.posts[0]!.body).get("email")).toBe(EMAIL);
  });

  it("explains a turned-down sign-in, quoting the site", async () => {
    const site = fakeLogin();
    await expect(signIn({ baseUrl: BASE, email: EMAIL, password: "wrong", fetchImpl: site.fetchImpl })).rejects.toThrow(
      /didn't accept the sign-in: "Invalid email or password"/,
    );
  });

  it("says so when the sign-in form changed", async () => {
    const site = fakeLogin({ loginPage: "<html><body>Please complete the captcha</body></html>" });
    const attempt = signIn({ baseUrl: BASE, email: EMAIL, password: PASSWORD, fetchImpl: site.fetchImpl });
    await expect(attempt).rejects.toBeInstanceOf(SignInError);
    await expect(attempt).rejects.toThrow(/sign-in page changed/);
  });
});

describe("mergeCookies", () => {
  it("adds, replaces and deletes cookies", () => {
    const response = new Response(null, {
      headers: [
        ["set-cookie", "a=2; path=/"],
        ["set-cookie", "b=; Max-Age=0"],
        ["set-cookie", "c=3"],
      ],
    });
    expect(mergeCookies({ a: "1", b: "x" }, response)).toEqual({ a: "2", c: "3" });
  });
});

describe("createSessionPoller", () => {
  const config: Config = {
    orgId: "1",
    auctionId: "2",
    friendlyAuctionPath: "gala",
    refreshIntervalSeconds: 10,
    totalFrom: "page",
  };
  const credentials = { email: EMAIL, password: PASSWORD };
  const context = (secrets: Record<string, string>, overrides: Partial<Config> = {}) => ({
    eventId: "e1",
    config: { ...config, ...overrides },
    secrets,
    signal: new AbortController().signal,
    log: vi.fn(),
  });

  /** A scraper that only shows the total to the current session. */
  function siteWithSession() {
    let valid = "s1";
    let logins = 0;
    const scrape = vi.fn(async ({ cookies }: { cookies?: Record<string, string> }) => {
      if (cookies?._session_id !== valid) throw new TotalNotShownError("hidden");
      return { total: 1234, items: [] };
    });
    const signInImpl = vi.fn(async ({ password }: { password: string }) => {
      if (password !== PASSWORD) throw new SignInError("32auctions didn't accept the sign-in.");
      logins++;
      return { _session_id: valid };
    });
    return {
      scrape,
      signInImpl,
      expire: (next: string) => (valid = next),
      logins: () => logins,
    };
  }

  it("signs in before it first needs the total, then reuses the session", async () => {
    const site = siteWithSession();
    const poll = createSessionPoller({ baseUrl: BASE, scrape: site.scrape, signInImpl: site.signInImpl });
    await expect(poll(context(credentials))).resolves.toEqual({ total: 1234, items: [] });
    await poll(context(credentials));
    expect(site.logins()).toBe(1);
  });

  it("signs in again when the session runs out", async () => {
    const site = siteWithSession();
    const poll = createSessionPoller({
      baseUrl: BASE,
      scrape: site.scrape,
      signInImpl: async (o) => {
        const cookies = await site.signInImpl(o);
        return cookies;
      },
    });
    await poll(context(credentials));
    site.expire("s2");
    await expect(poll(context(credentials))).resolves.toMatchObject({ total: 1234 });
    expect(site.logins()).toBe(2);
  });

  it("also signs in again after a 401", async () => {
    let calls = 0;
    const scrape = vi.fn(async () => {
      calls++;
      if (calls === 2) throw new HttpError(401, `${BASE}/x`);
      return { total: 1, items: [] };
    });
    const signInImpl = vi.fn(async () => ({ _session_id: "s" }));
    const poll = createSessionPoller({ baseUrl: BASE, scrape, signInImpl });
    await poll(context(credentials));
    await poll(context(credentials));
    expect(signInImpl).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry a turned-down password until it changes", async () => {
    const site = siteWithSession();
    const poll = createSessionPoller({ baseUrl: BASE, scrape: site.scrape, signInImpl: site.signInImpl });
    const wrong = { email: EMAIL, password: "wrong" };
    await expect(poll(context(wrong))).rejects.toThrow(/didn't accept/);
    await expect(poll(context(wrong))).rejects.toThrow(/didn't accept/);
    expect(site.signInImpl).toHaveBeenCalledTimes(1);
    await expect(poll(context(credentials))).resolves.toMatchObject({ total: 1234 });
  });

  it("says when a fresh sign-in still can't see the total", async () => {
    const scrape = vi.fn(async () => {
      throw new TotalNotShownError("hidden");
    });
    const poll = createSessionPoller({ baseUrl: BASE, scrape, signInImpl: async () => ({ _session_id: "s" }) });
    await expect(poll(context(credentials))).rejects.toThrow(/organizer account for this auction/);
  });

  it("doesn't sign in when the total isn't needed, or without an email and password", async () => {
    const site = siteWithSession();
    const poll = createSessionPoller({
      baseUrl: BASE,
      scrape: async () => ({ total: 0, items: [] }),
      signInImpl: site.signInImpl,
    });
    await poll(context(credentials, { totalFrom: "none" }));
    await poll(context({ sessionCookie: "pasted" }));
    expect(site.signInImpl).not.toHaveBeenCalled();
  });
});
