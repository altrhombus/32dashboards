import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CommandError } from "@32dashboards/source-sdk";

/*
 * Copies an image from an auction platform into one of this bundle's asset
 * categories, so setting up an event can offer the organization's logo
 * without a download-and-upload detour. Only images from the platforms'
 * own hosts, and no SVG: an SVG served from the dashboard's origin could run
 * script if opened directly.
 */

export const ALLOWED_HOSTS = [/(^|\.)32auctions\.com$/i];
export const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** A file name from a label: "Riverside Animal Shelter" -> "riverside-animal-shelter". */
export function fileStem(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image"
  );
}

export interface ImportOptions {
  /** Where NodeCG keeps assets: <runtime root>/assets. */
  assetsRoot: string;
  namespace: string;
  category: string;
  url: string;
  name: string;
  fetchImpl?: typeof fetch;
}

/** Downloads and saves the image; returns its asset URL ("/assets/<namespace>/<category>/<file>"). */
export async function importAsset(options: ImportOptions): Promise<string> {
  const { assetsRoot, namespace, category, name, fetchImpl = fetch } = options;
  let url: URL;
  try {
    url = new URL(options.url);
  } catch {
    throw new CommandError("That isn't a web address.");
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.some((host) => host.test(url.hostname))) {
    throw new CommandError("Images can only be copied from the auction site; upload other images instead.");
  }

  const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
  if (!response.ok) throw new CommandError(`The image couldn't be downloaded (HTTP ${response.status}).`);
  const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const extension = TYPES[type];
  if (!extension) throw new CommandError("That isn't a PNG, JPEG, WebP or GIF image.");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new CommandError("The image is bigger than 5 MB.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new CommandError("The image is bigger than 5 MB.");

  const dir = path.join(assetsRoot, namespace, category);
  await mkdir(dir, { recursive: true });
  const stem = fileStem(name);
  let file = `${stem}.${extension}`;
  for (let n = 2; existsSync(path.join(dir, file)); n++) file = `${stem}-${n}.${extension}`;
  await writeFile(path.join(dir, file), bytes);
  return `/assets/${namespace}/${category}/${encodeURIComponent(file)}`;
}
