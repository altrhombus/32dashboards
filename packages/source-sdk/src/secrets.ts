import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

type Scopes = Record<string, Record<string, string>>;

/**
 * Credentials (session cookies, push tokens) kept out of Replicants: any
 * graphic or panel can read a Replicant, so secrets live in an owner-only
 * file under NodeCG's `db/` instead, which keeps them in the same backup.
 * Values are only ever written from the dashboard, never sent back to it.
 *
 * Scopes are usually event ids, so each event has its own credentials.
 */
export class SecretStore {
  #data: Scopes;

  constructor(readonly file: string) {
    this.#data = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Scopes) : {};
  }

  get(scope: string, key: string): string | undefined {
    return this.#data[scope]?.[key];
  }

  /** All values in a scope. */
  read(scope: string): Readonly<Record<string, string>> {
    return { ...this.#data[scope] };
  }

  /** Keys that have a value, safe to show operators. */
  keys(scope: string): string[] {
    return Object.keys(this.#data[scope] ?? {}).sort();
  }

  scopes(): string[] {
    return Object.keys(this.#data);
  }

  /** Sets a value, or removes it when `value` is null or empty. */
  set(scope: string, key: string, value: string | null): void {
    const values = { ...this.#data[scope] };
    if (value) values[key] = value;
    else delete values[key];
    if (Object.keys(values).length) this.#data = { ...this.#data, [scope]: values };
    else this.#data = Object.fromEntries(Object.entries(this.#data).filter(([s]) => s !== scope));
    this.#save();
  }

  copyScope(from: string, to: string): void {
    const values = this.#data[from];
    if (!values) return;
    this.#data = { ...this.#data, [to]: { ...values } };
    this.#save();
  }

  deleteScope(scope: string): void {
    if (!(scope in this.#data)) return;
    const { [scope]: _deleted, ...rest } = this.#data;
    this.#data = rest;
    this.#save();
  }

  #save(): void {
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.#data, null, 2)}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.file);
  }
}

/** The store for one adapter: `<NodeCG root>/db/source-secrets/<sourceId>.json`. */
export function secretStoreFor(sourceId: string, root = process.cwd()): SecretStore {
  return new SecretStore(path.join(root, "db", "source-secrets", `${sourceId}.json`));
}
