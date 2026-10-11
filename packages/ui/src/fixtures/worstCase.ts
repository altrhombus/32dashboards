import type { SourceItem } from "@32dashboards/schema/core";

/*
 * Worst-case strings and numbers to design and test against. Every
 * component that shows operator- or source-supplied text gets a test with
 * these, so layouts are built for the longest real input, not the demo.
 */

/** 25 characters: the longest name components must fit without breaking layout. */
export const LONG_NAME = "Maximiliana Wolfeschlegel";

/** A title at the 200-character limit that starts with a 59-character unbreakable word. */
export const LONG_TITLE = (
  "Supercalifragilisticexpialidocious-Weekend-Getaway-Package:" +
  " two nights at the lakeside cabin, guided kayak tour, catered dinner for eight, and a signed print by a local artist, plus a spa day and brunch for two"
).slice(0, 200);

export const LONG_DESCRIPTION = "Lorem ipsum dolor sit amet ".repeat(11).trim();

/** Eight digits: what the total and counters must have room for. */
export const HUGE_TOTAL = 99_999_999.99;

export const worstCaseItems: SourceItem[] = [
  { id: "long", title: LONG_TITLE, imageUrl: null, currentBid: 9_999_999, value: 12_000_000, bidCount: 9_999, remaining: "29 days 23 hours" },
  { id: "name", title: LONG_NAME, imageUrl: "https://example.test/missing.jpg", currentBid: null, value: null, bidCount: null, remaining: null },
  { id: "empty", title: "", imageUrl: null, currentBid: 0, value: 0, bidCount: 0, remaining: "" },
];
