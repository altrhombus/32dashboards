import { describe, expect, it } from "vitest";
import { BID_MEMORY_MS, DONATION_GRACE_MS, DonationLedger } from "./donations.js";

const E = "event";

describe("DonationLedger", () => {
  it("thanks a donation once it's waited, if no bid explains it", () => {
    const ledger = new DonationLedger();
    ledger.observe(E, 20, 0, 0);
    expect(ledger.due(E, DONATION_GRACE_MS - 1)).toBe(0);
    expect(ledger.due(E, DONATION_GRACE_MS)).toBe(20);
    expect(ledger.due(E, DONATION_GRACE_MS + 1)).toBe(0);
  });

  it("doesn't thank a total that rose a refresh before its bid showed", () => {
    const ledger = new DonationLedger();
    ledger.observe(E, 30, 0, 0); // total +30, no bid yet
    ledger.observe(E, 0, 30, 13_000); // the bid shows, the total doesn't move
    expect(ledger.due(E, 60_000)).toBe(0);
  });

  it("doesn't thank a total that caught up after its bid showed", () => {
    const ledger = new DonationLedger();
    ledger.observe(E, 0, 30, 0); // the bid shows first
    ledger.observe(E, 30, 0, 10_000); // then the total
    expect(ledger.due(E, 60_000)).toBe(0);
  });

  it("thanks only the part a bid doesn't explain", () => {
    const ledger = new DonationLedger();
    ledger.observe(E, 80, 30, 0);
    expect(ledger.due(E, DONATION_GRACE_MS)).toBe(50);
  });

  it("forgets bid money the total never showed", () => {
    const ledger = new DonationLedger();
    ledger.observe(E, 0, 30, 0);
    ledger.observe(E, 30, 0, BID_MEMORY_MS + 1);
    expect(ledger.due(E, BID_MEMORY_MS + 1 + DONATION_GRACE_MS)).toBe(30);
  });

  it("doesn't treat a drop in the total as a bid", () => {
    const ledger = new DonationLedger();
    ledger.observe(E, -50, 0, 0);
    ledger.observe(E, 50, 0, 1000);
    expect(ledger.due(E, 1000 + DONATION_GRACE_MS)).toBe(50);
  });
});
