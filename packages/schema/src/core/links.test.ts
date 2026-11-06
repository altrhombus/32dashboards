import { describe, expect, it } from "vitest";
import { firstLink, shortenLinks } from "./links.js";

describe("firstLink", () => {
  it.each([
    ["Bid at https://www.32auctions.com/SpringGala", "https://www.32auctions.com/SpringGala"],
    ["Bid at 32auctions.com/SpringGala tonight.", "https://32auctions.com/SpringGala"],
    ["Go to www.example.org/give!", "https://www.example.org/give"],
    ["http://example.com/a?b=c, then bid", "http://example.com/a?b=c"],
  ])("finds the address in %s", (text, link) => {
    expect(firstLink(text)).toBe(link);
  });

  it("finds nothing in plain words", () => {
    expect(firstLink("Scan the code on your table. Thank you!")).toBeNull();
    expect(firstLink("")).toBeNull();
  });
});

describe("shortenLinks", () => {
  it("drops the scheme and www", () => {
    expect(shortenLinks("Bid at https://www.32auctions.com/SpringGala")).toBe("Bid at 32auctions.com/SpringGala");
    expect(shortenLinks("http://example.com and more")).toBe("example.com and more");
  });

  it("leaves other text alone", () => {
    expect(shortenLinks("Scan the code on your table")).toBe("Scan the code on your table");
  });
});
