import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, test as base, type Browser, type Page } from "@playwright/test";
import { ADMIN_PASSWORD, RUNTIME_FILE } from "./constants.js";

export const LIVE = "/bundles/fundraiser-core/dashboard/live.html?standalone=true";
export const KIOSK = "/bundles/layout-kiosk/graphics/kiosk.html";
export const PHONE = { width: 390, height: 844 };
/** Long enough to have stretched the phone console past its screen. */
export const LONG_NAME = "The Riverside Animal Shelter Annual Spring Gala and Silent Auction 2026";

export const displayToken = () =>
  readFileSync(path.join(readFileSync(RUNTIME_FILE, "utf8"), "db", "display-token"), "utf8").trim();

/** Sends a Message from a dashboard page, the way a panel does, and returns its ack. */
export const send = (page: Page, name: string, bundle: string, data?: unknown) =>
  page.evaluate(([n, b, d]) => window.nodecg.sendMessageToBundle(n as string, b as string, d), [name, bundle, data]);

export const test = base.extend<object, { sharedBrowser: Browser }>({
  sharedBrowser: [
    async ({ playwright: _ }, use) => {
      const url = process.env.E2E_CDP_URL;
      const browser = url ? await chromium.connectOverCDP(url) : await chromium.launch();
      await use(browser);
      await browser.close();
    },
    { scope: "worker" },
  ],
  browser: async ({ sharedBrowser }, use) => use(sharedBrowser),
});

/** Signs in, in the page's context. */
export async function signIn(page: Page) {
  await page.goto("/login/");
  await page.locator('input[name="username"], #username').fill("admin");
  await page.locator('input[name="password"], #password').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"], #localSubmit').first().click();
  await page.waitForURL(/dashboard/);
}

/** An event on the TVs, entered by hand, with one item nobody has bid on. */
export async function liveEvent(page: Page, name = LONG_NAME) {
  await page.goto(LIVE);
  await page.waitForFunction(() => window.nodecg?.socket?.connected);
  const eventId = (await send(page, "createEvent", "fundraiser-core", { name: `${name} ${Date.now()}` })) as string;
  await send(page, "updateEvent", "fundraiser-core", {
    eventId,
    patch: {
      source: { adapterId: "manual" },
      callToAction: "Bid at https://www.32auctions.com/SpringGala",
      askMeRounds: ["First appeal", "Second appeal"].map((title) => ({
        id: crypto.randomUUID(),
        title,
        message: "Every **$250** helps.\n- One\n- Two",
        raised: null,
      })),
    },
  });
  await send(page, "setTotal", "source-manual", { eventId, total: 1000 });
  await send(page, "upsertItem", "source-manual", {
    eventId,
    item: { title: "Hot air balloon ride", currentBid: 150, value: 450, bidCount: 0 },
  });
  await send(page, "activateEvent", "fundraiser-core", { eventId });
  await send(page, "switchScene", "fundraiser-core", { id: "main" });
  return eventId;
}

declare global {
  interface Window {
    nodecg: {
      sendMessageToBundle(name: string, bundle: string, data?: unknown): Promise<unknown>;
      socket: { connected: boolean; disconnect(): void; connect(): void };
    };
  }
}
