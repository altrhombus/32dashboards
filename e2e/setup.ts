import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ADMIN_PASSWORD, PORT, RUNTIME_FILE } from "./constants.js";

const REPO = path.resolve(import.meta.dirname, "..");

/** Starts NodeCG on the repo's bundles, in a throwaway runtime root; returns how to stop it. */
export default async function globalSetup() {
  const root = mkdtempSync(path.join(tmpdir(), "32dashboards-e2e-"));
  for (const entry of ["bundles", "node_modules", "package.json"])
    symlinkSync(path.join(REPO, entry), path.join(root, entry));
  mkdirSync(path.join(root, "cfg"));
  const sessionSecret = "e2e-session-secret";
  const hash = createHmac("sha256", sessionSecret).update(ADMIN_PASSWORD, "utf8").digest("hex");
  writeFileSync(
    path.join(root, "cfg", "nodecg.json"),
    JSON.stringify({
      host: "127.0.0.1",
      port: PORT,
      login: {
        enabled: true,
        sessionSecret,
        local: { enabled: true, allowedUsers: [{ username: "admin", password: `sha256:${hash}` }] },
      },
    }),
  );
  writeFileSync(RUNTIME_FILE, root);

  const nodecg = spawn(process.execPath, [path.join(REPO, "node_modules/nodecg/cli.mjs"), "start"], {
    cwd: root,
    env: { ...process.env, NODECG_ROOT: root, SECRETS_KEY_FILE: path.join(root, "secrets.key") },
    stdio: "ignore",
  });
  const stop = async () => {
    nodecg.kill();
    rmSync(root, { recursive: true, force: true });
    rmSync(RUNTIME_FILE, { force: true });
  };
  for (let i = 0; i < 120; i++) {
    const up = await fetch(`http://127.0.0.1:${PORT}/login/`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (up?.ok) return stop;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await stop();
  throw new Error("NodeCG didn't start; did you run pnpm bundles:build?");
}
