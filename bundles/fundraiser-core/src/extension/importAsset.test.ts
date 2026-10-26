import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_BYTES, fileStem, importAsset } from "./importAsset.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function site(body: Uint8Array | string, type = "image/png", status = 200) {
  const requests: string[] = [];
  const fetchImpl = (async (url: string) => {
    requests.push(url);
    return new Response(body as BodyInit, { status, headers: { "content-type": type } });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

const options = (overrides: Partial<Parameters<typeof importAsset>[0]> = {}) => ({
  assetsRoot: mkdtempSync(path.join(tmpdir(), "assets-")),
  namespace: "fundraiser-core",
  category: "event-logos",
  url: "https://assets.32auctions.com/pics/1/logo_s550.png",
  name: "Riverside Animal Shelter",
  ...overrides,
});

describe("importAsset", () => {
  it("saves an image from the auction site under a readable name, without overwriting", async () => {
    const o = options();
    const { fetchImpl } = site(PNG);
    expect(await importAsset({ ...o, fetchImpl })).toBe(
      "/assets/fundraiser-core/event-logos/riverside-animal-shelter.png",
    );
    expect(await importAsset({ ...o, fetchImpl })).toBe(
      "/assets/fundraiser-core/event-logos/riverside-animal-shelter-2.png",
    );
    expect(
      readFileSync(path.join(o.assetsRoot, "fundraiser-core", "event-logos", "riverside-animal-shelter.png")),
    ).toEqual(Buffer.from(PNG));
  });

  it("only copies from the auction site, over https", async () => {
    const { fetchImpl, requests } = site(PNG);
    for (const url of [
      "https://example.com/x.png",
      "http://assets.32auctions.com/x.png",
      "https://32auctions.com.evil.test/x.png",
    ]) {
      await expect(importAsset({ ...options({ url }), fetchImpl })).rejects.toThrow(
        /only be copied from the auction site/,
      );
    }
    expect(requests).toEqual([]);
  });

  it("refuses SVG and other non-images, failures, and anything too big", async () => {
    await expect(importAsset({ ...options(), ...site("<svg/>", "image/svg+xml") })).rejects.toThrow(
      /PNG, JPEG, WebP or GIF/,
    );
    await expect(importAsset({ ...options(), ...site("<html/>", "text/html") })).rejects.toThrow(
      /PNG, JPEG, WebP or GIF/,
    );
    await expect(importAsset({ ...options(), ...site(PNG, "image/png", 404) })).rejects.toThrow(/HTTP 404/);
    await expect(importAsset({ ...options(), ...site(new Uint8Array(MAX_BYTES + 1)) })).rejects.toThrow(
      /bigger than 5 MB/,
    );
  });
});

describe("fileStem", () => {
  it("makes a tidy file name", () => {
    expect(fileStem("Riverside Animal Shelter — North!")).toBe("riverside-animal-shelter-north");
    expect(fileStem("???")).toBe("image");
  });
});
