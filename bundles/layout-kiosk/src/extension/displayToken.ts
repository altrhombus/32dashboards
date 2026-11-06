import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/*
 * The token TVs use instead of the dashboard's key. It opens the kiosk page
 * and nothing else: NodeCG (patches/nodecg@2.8.0.patch) reads this file, and
 * keeps a connection made with it to reading what the TV shows and checking
 * in. Someone who copies a TV's address can see the show, not run it.
 */

export const displayTokenFile = (root = process.cwd()) => path.join(root, "db", "display-token");

export const newDisplayToken = () => `tv-${randomBytes(24).toString("base64url")}`;

export function writeDisplayToken(file: string, token: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
}

/** The token in `file`, made the first time it's needed. */
export function readDisplayToken(file: string): string {
  if (existsSync(file)) {
    const token = readFileSync(file, "utf8").trim();
    if (token) return token;
  }
  const token = newDisplayToken();
  writeDisplayToken(file, token);
  return token;
}
