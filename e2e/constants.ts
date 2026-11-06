import { tmpdir } from "node:os";
import path from "node:path";

export const PORT = 9099;
export const ADMIN_PASSWORD = "e2e-password";
/** Where global setup leaves the throwaway runtime root, for tests that read its files. */
export const RUNTIME_FILE = path.join(tmpdir(), "32dashboards-e2e-root");
