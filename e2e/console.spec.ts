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

  test("shows the amounts the appeal calls out", async ({ page }) => {
    await page.locator(".phone-tabs button", { hasText: "Ask Me" }).click();
    const pad = page.locator(".askme__pad");
    await expect(pad.getByRole("button")).toHaveText(["+$500", "+$100", "+$50"]);
  });

  test("keeps a typed amount for the next gift", async ({ page }) => {
    await page.locator(".phone-tabs button", { hasText: "Ask Me" }).click();
    await page.getByLabel("Other Ask Me amount").fill("200");
    const add = page.getByRole("button", { name: "Add $200" });
    await add.click();
    await expect(page.locator(".askme__total")).toHaveText("$200");
    await add.click();
    await expect(page.locator(".askme__total")).toHaveText("$400");
    await page.getByLabel("Other Ask Me amount").click();
    await page.keyboard.type("75");
    await expect(page.getByRole("button", { name: "Add $75" })).toBeVisible();
  });

  test("switches to another round at the last minute", async ({ page }) => {
    await page.locator(".phone-tabs button", { hasText: "Ask Me" }).click();
    await expect(page.locator(".askme__head")).toContainText("First appeal");
    await page.getByRole("button", { name: "Start now" }).click();
    await expect(page.locator(".askme__head")).toContainText("Ask Me 1 of 2 · Second appeal");
    await page.getByRole("button", { name: "+$100" }).click();
    await expect(page.getByRole("button", { name: "Start now" })).toHaveCount(0);
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

  test("shows the dashboard's tabs, and the console on its own page leads back to them", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await page.goto("/dashboard/");
    await page.waitForURL(/#fullbleed\/live/);
    await expect(page.locator("paper-tab.workspaceTab", { hasText: "Sources" })).toBeVisible();
    await page.goto(LIVE);
    await page.getByRole("navigation", { name: "Dashboard tabs" }).getByRole("link", { name: "Screens" }).click();
    await page.waitForURL(/#workspace\/screens/);
    await expect(page.locator("paper-tab.workspaceTab", { hasText: "Screens" })).toBeVisible();
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

  test("changes the starting bid from the phone before bidding opens", async ({ page }) => {
    await auction(page);
    await expect(page.locator(".live-pad__start")).toContainText("Starting bid: $500");
    await page.locator(".live-pad__start").getByRole("button", { name: "Change" }).click();
    await page.getByLabel("Starting bid").fill("400");
    await page.getByRole("button", { name: "Save $400" }).click();
    await expect(page.locator(".live-pad__start")).toContainText("Starting bid: $400");
    await page.getByRole("button", { name: "Open at $400" }).click();
    await expect(page.locator(".askme__total")).toHaveText("$400");
    await expect(page.locator(".live-pad__start")).toHaveCount(0);
  });

  test("shows the starting bid with the bid off the TV too", async ({ page }) => {
    await auction(page);
    await page.getByLabel(/Show bids on the TV/).click();
    await expect(page.locator(".live-pad__start")).toContainText("Starting bid: $500");
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
