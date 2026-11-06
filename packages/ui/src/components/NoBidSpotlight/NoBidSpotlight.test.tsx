import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SourceItem } from "@32dashboards/schema/core";
import { FeaturedItemsGrid } from "../FeaturedItemsGrid/FeaturedItemsGrid.js";
import { NoBidSpotlight } from "./NoBidSpotlight.js";

const item = (id: string, patch: Partial<SourceItem> = {}): SourceItem => ({
  id,
  title: `Item ${id}`,
  imageUrl: null,
  currentBid: 40,
  value: 100,
  bidCount: 0,
  remaining: null,
  url: `https://example.test/items/${id}`,
  ...patch,
});

describe("NoBidSpotlight", () => {
  it("shows two items at a time, each with its QR code", () => {
    render(<NoBidSpotlight items={[item("a"), item("b"), item("c")]} />);
    expect(screen.getByText("Item a")).toBeInTheDocument();
    expect(screen.getByText("Item b")).toBeInTheDocument();
    expect(screen.queryByText("Item c")).toBeNull();
    expect(screen.getByRole("img", { name: "QR code to bid on Item a" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByText("3 items waiting")).toBeInTheDocument();
  });

  it("leaves the code out when the source has no link", () => {
    render(<NoBidSpotlight items={[item("a", { url: null })]} />);
    expect(screen.queryByText("Scan to bid")).toBeNull();
  });

  it("says thank you when every item has a bid", () => {
    render(<NoBidSpotlight items={[]} />);
    expect(screen.getByText(/Every item has a bid/)).toBeInTheDocument();
  });
});

describe("FeaturedItemsGrid", () => {
  it("invites a first bid instead of saying 0 bids", () => {
    render(<FeaturedItemsGrid items={[item("a"), item("b", { bidCount: 1 }), item("c", { bidCount: null })]} />);
    expect(screen.getAllByText("Be the first!")).toHaveLength(1);
    expect(screen.getByText("1 bid")).toBeInTheDocument();
    expect(screen.queryByText("0 bids")).toBeNull();
  });
});
