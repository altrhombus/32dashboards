import { expect, type Page } from "@playwright/test";
import { LIVE, LONG_NAME, PHONE, liveEvent, send, signIn, test } from "./fixtures.js";

test.describe("the phone console", () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await liveEvent(page);
    await page.goto(LIVE);
    await expect(page.locator(".phone-tabs")).toBeVisible();
  });

  test("fits the phone with a long event name, on every tab", async ({ page }) => {
    expect(LONG_NAME.length).toBeGreaterThan(50);
    for (const tab of ["Money", "Ask Me", "Scenes", "More"]) {
      await page.locator(".phone-tabs button", { hasText: tab }).click();
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, tab).toBeLessThanOrEqual(PHONE.width);
    }
  });

  test("can reach every Ask Me amount", async ({ page }) => {
    await page.locator(".phone-tabs button", { hasText: "Ask Me" }).click();
    const box = await page.getByRole("button", { name: "+$500" }).boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
  });

  test("won't take an undone tap out of the next round", async ({ page }) => {
    await page.locator(".phone-tabs button", { hasText: "Ask Me" }).click();
    await page.getByRole("button", { name: "+$100" }).click();
    await expect(page.locator(".askme__total")).toHaveText("$100");
    await page.getByRole("button", { name: /^Finish round 1/ }).click();
    await expect(page.locator(".askme__total")).toHaveText("$0");
    await page.getByRole("button", { name: "+$50", exact: true }).click();
    await expect(page.locator(".askme__total")).toHaveText("$50");
    const tap = page.locator(".recent__row", { hasText: "Added $100 to Ask Me" });
    await tap.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".feedback")).toContainText("Couldn't undo");
    await expect(page.locator(".askme__total")).toHaveText("$50");
    await expect(tap.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("asks twice before skipping a round", async ({ page }) => {
    await page.locator(".phone-tabs button", { hasText: "Ask Me" }).click();
    await page.getByRole("button", { name: /^Skip round 1/ }).click();
    await expect(page.getByRole("button", { name: /Tap again: skip round 1/ })).toBeVisible();
    await expect(page.locator(".askme__head")).toContainText("Ask Me 1 of 2");
  });

  test("fixes an appeal's words without losing its lines", async ({ page }) => {
    await page.locator(".phone-tabs button", { hasText: "Ask Me" }).click();
    await page.getByText("Edit this appeal").click();
    const message = page.getByLabel("Appeal message");
    await message.fill("Every **$300** helps.\n- One\n- Two");
    await page.getByRole("button", { name: "Save the appeal" }).click();
    await expect(page.locator(".feedback")).toContainText("Saved the appeal");
    await page.reload();
    await page.locator(".phone-tabs button", { hasText: "Ask Me" }).click();
    await page.getByText("Edit this appeal").click();
    await expect(page.getByLabel("Appeal message")).toHaveValue("Every **$300** helps.\n- One\n- Two");
  });

  test("says when the laptop is gone, and when it's back", async ({ page }) => {
    await page.evaluate(() => window.nodecg.socket.disconnect());
    await expect(page.getByText("Lost the laptop. Reconnecting…")).toBeVisible({ timeout: 6000 });
    await page.evaluate(() => window.nodecg.socket.connect());
    await expect(page.getByText("Lost the laptop. Reconnecting…")).toBeHidden();
  });

  test("names a problem in words", async ({ page }) => {
    await expect(page.locator(".phone-head__problem")).toContainText("A TV isn't connected");
  });
});

test.describe("guard rails", () => {
  test("leaving Ask Me with money in the round says what it does", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    const eventId = await liveEvent(page);
    await send(page, "switchScene", "fundraiser-core", { id: "askMe" });
    await send(page, "nudgeAskMe", "fundraiser-core", { eventId, delta: 40 });
    await page.goto(LIVE);
    await page.getByRole("button", { name: /^Main/ }).click();
    await expect(page.getByRole("button", { name: /Tap again: finish this round \(\$40\)/ })).toBeVisible();
    await expect(page.locator(".scene--on-air")).toContainText("Ask Me");
  });

  test("the dashboard opens on Live, in the order a show runs", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await page.goto("/dashboard/");
    await page.waitForURL(/#fullbleed\/live/);
    const tabs = await page.evaluate(() =>
      (window as unknown as { __renderData__: { workspaces: { label: string }[] } }).__renderData__.workspaces.map(
        (w) => w.label,
      ),
    );
    expect(tabs.map((t) => t.toLowerCase())).toEqual(["live", "event", "new event", "screens", "layouts", "sources"]);
  });
});

test.describe("the live auction", () => {
  test.use({ viewport: PHONE });

  async function auction(page: Page) {
    await signIn(page);
    const eventId = await liveEvent(page);
    await send(page, "updateEvent", "fundraiser-core", {
      eventId,
      patch: {
        liveLots: ["Week at the lake house", "Chef's dinner for ten"].map((title) => ({
          id: crypto.randomUUID(),
          title,
          startingBid: 500,
          value: 2000,
        })),
      },
    });
    await send(page, "switchScene", "fundraiser-core", { id: "liveAuction" });
    await page.goto(LIVE);
    await expect(page.getByLabel("Live auction")).toBeVisible();
  }

  test("runs an item from the opening bid to SOLD, and fits the phone", async ({ page }) => {
    await auction(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
    const tabs = await page.locator(".phone-tabs button").evaluateAll((all) => all.map((b) => b.offsetTop));
    expect(new Set(tabs).size, "phone tabs on one row").toBe(1);
    await page.getByRole("button", { name: "Open at $500" }).click();
    await expect(page.locator(".askme__total")).toHaveText("$500");
    await page.getByRole("button", { name: "+$250", exact: true }).click();
    await expect(page.locator(".askme__total")).toHaveText("$750");
    await page.locator(".live-pad__raise").click();
    await expect(page.locator(".askme__total")).toHaveText("$1,000");
    await page.getByLabel("Paddle number (optional)").fill("42");
    await page.getByRole("button", { name: "SOLD for $1,000" }).click();
    await page.getByRole("button", { name: "Tap again: SOLD for $1,000" }).click();
    await expect(page.locator(".askme__head")).toContainText("Chef's dinner for ten");
    await expect(page.locator(".askme__plan")).toContainText("$1,000 · #42");
  });

  test("works with the bid off the TV: the price goes in at SOLD", async ({ page }) => {
    await auction(page);
    await page.getByLabel(/Show bids on the TV/).click();
    await expect(page.locator(".live-pad__raise")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enter the final price" })).toBeDisabled();
    await page.getByLabel("Final price").fill("1500");
    await page.getByRole("button", { name: "SOLD for $1,500" }).click();
    await page.getByRole("button", { name: "Tap again: SOLD for $1,500" }).click();
    await expect(page.locator(".askme__plan")).toContainText("$1,500");
  });
});
