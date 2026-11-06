import { expect } from "@playwright/test";
import { KIOSK, LIVE, displayToken, liveEvent, send, signIn, test } from "./fixtures.js";

test.describe("the TV token", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await liveEvent(page);
  });

  test("shows the TV, and checks in as a screen", async ({ browser, page }) => {
    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await tv.goto(`${KIOSK}?key=${displayToken()}`);
    await expect(tv.locator(".total-raised-counter__amount")).toBeVisible();
    await page.goto(LIVE);
    await expect(page.locator(".status--go", { hasText: "connected" }).first()).toBeVisible({ timeout: 15_000 });
    await tv.context().close();
  });

  test("can't open the dashboard, panels or uploads", async ({ browser }) => {
    const context = await browser.newContext();
    const key = displayToken();
    for (const path of ["/dashboard/", "/bundles/fundraiser-core/dashboard/live.html"]) {
      const response = await context.request.get(`${path}?key=${key}`, { maxRedirects: 0 });
      expect(response.status(), path).toBe(403);
    }
    const upload = await context.request.post(`/assets/fundraiser-core/event-logos?key=${key}`, { maxRedirects: 0 });
    expect(upload.status()).toBe(403);
    await context.close();
  });

  test("can't change the show, even from the TV's own page", async ({ browser, page }) => {
    const tv = await (await browser.newContext()).newPage();
    await tv.goto(`${KIOSK}?key=${displayToken()}`);
    await tv.waitForFunction(() => window.nodecg?.socket?.connected);
    const attempt = tv.evaluate(() =>
      Promise.race([
        window.nodecg.sendMessageToBundle("switchScene", "fundraiser-core", { id: "celebration" }).then(
          () => "ran",
          (err: unknown) => String(err),
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve("no answer"), 3000)),
      ]),
    );
    expect(await attempt).not.toBe("ran");
    await tv.context().close();
    await page.reload();
    await expect(page.locator(".scene--on-air")).toContainText("Main");
  });

  test("leaves the dashboard signed in when a TV opens beside it", async ({ page }) => {
    await page.goto(`${KIOSK}?key=${displayToken()}`);
    await expect(page.locator(".total-raised-counter__amount")).toBeVisible();
    const dashboard = await page.request.get("/dashboard/", { maxRedirects: 0 });
    expect(dashboard.status()).toBe(200);
  });
});

test.describe("what the room sees", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("No bids yet shows an item with its details", async ({ page }) => {
    await signIn(page);
    await liveEvent(page);
    await send(page, "switchScene", "fundraiser-core", { id: "noBids" });
    await page.goto(`${KIOSK}?preview`);
    await expect(page.getByText("No bids yet. Be the first!")).toBeVisible();
    await expect(page.locator(".no-bid-spotlight__title")).toHaveText("Hot air balloon ride");
    await expect(page.getByText("Starts at $150")).toBeVisible();
  });

  test("Welcome offers a QR code and says the address once", async ({ page }) => {
    await signIn(page);
    await liveEvent(page);
    await send(page, "switchScene", "fundraiser-core", { id: "welcome" });
    await page.goto(`${KIOSK}?preview`);
    await expect(page.getByRole("img", { name: "QR code to bid or give" })).toBeVisible();
    await expect(page.getByText("https://")).toHaveCount(0);
  });
});

test.describe("milestones on the TV", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("play in the bar, with the full screen kept for labeled ones", async ({ browser, page }) => {
    await signIn(page);
    const eventId = await liveEvent(page);
    await send(page, "updateEvent", "fundraiser-core", {
      eventId,
      patch: {
        milestoneStyle: "named",
        milestones: [
          { id: crypto.randomUUID(), amount: 1500, label: "" },
          { id: crypto.randomUUID(), amount: 2000, label: "A new van" },
        ],
      },
    });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await context.newPage();
    await tv.goto(`${KIOSK}?key=${displayToken()}`);
    await expect(tv.locator(".total-raised-counter__amount")).toBeVisible();

    await send(page, "nudgeAdjustment", "fundraiser-core", { eventId, delta: 600 });
    await expect(tv.locator(".kiosk-info-bar--starring")).toBeVisible();
    await expect(tv.locator(".milestone-spotlight")).toHaveCount(0);

    await send(page, "nudgeAdjustment", "fundraiser-core", { eventId, delta: 500 });
    await expect(tv.locator(".milestone-spotlight")).toContainText("A new van", { timeout: 12_000 });
    await context.close();
  });
});

test.describe("the live auction on the TV", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("follows the bid, then stamps SOLD, on a display-only link", async ({ browser, page }) => {
    await signIn(page);
    const eventId = await liveEvent(page);
    const lotId = crypto.randomUUID();
    await send(page, "updateEvent", "fundraiser-core", {
      eventId,
      patch: { liveLots: [{ id: lotId, title: "Week at the lake house", startingBid: 500, value: 2000 }] },
    });
    await send(page, "switchScene", "fundraiser-core", { id: "liveAuction" });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await context.newPage();
    await tv.goto(`${KIOSK}?key=${displayToken()}`);
    await expect(tv.locator(".live-stage__title")).toHaveText("Week at the lake house");
    await expect(tv.locator(".live-stage__bid-amount")).toHaveText("$500");

    await send(page, "setLiveBid", "fundraiser-core", { eventId, lotId, amount: 900 });
    await expect(tv.locator(".live-stage__bid-amount")).toHaveText("$900");

    await send(page, "sellLiveLot", "fundraiser-core", { eventId, lotId, amount: 900, paddle: "42" });
    await expect(tv.locator(".live-sold")).toContainText("Paddle 42");
    await context.close();
  });
});
