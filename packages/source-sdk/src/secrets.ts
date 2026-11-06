import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

type Scopes = Record<string, Record<string, string>>;

/** How a store's file looks on disk: AES-256-GCM over the JSON of its scopes. */
interface Sealed {
  sealed: 1;
  iv: string;
  tag: string;
  data: string;
}

/**
 * Where the key that seals secret stores lives: outside the repo, so it isn't
 * in `pnpm backup`'s archives. A leaked backup then holds no readable
 * passwords. It doesn't stop someone already logged in as this user.
 */
export function defaultKeyFile(): string {
  return process.env.SECRETS_KEY_FILE ?? path.join(homedir(), ".config", "32dashboards", "secrets.key");
}

function loadKey(file: string): Buffer {
  if (existsSync(file)) return Buffer.from(readFileSync(file, "utf8").trim(), "base64");
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const key = randomBytes(32);
  writeFileSync(file, `${key.toString("base64")}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return key;
}

function isSealed(value: unknown): value is Sealed {
  return typeof value === "object" && value !== null && (value as Sealed).sealed === 1;
}

/**
 * Credentials (session cookies, passwords, push-token hashes) kept out of
 * Replicants: any graphic or panel can read a Replicant, so secrets live in
 * an owner-only file under NodeCG's `db/` instead, sealed with a key kept
 * outside the repo. Values are only ever written from the dashboard, never
 * sent back to it. A file from before sealing is read as it is, and sealed
 * straight away.
 *
 * Scopes are usually event ids, so each event has its own credentials.
 */
export class SecretStore {
  #data: Scopes;
  readonly #key: Buffer;

  constructor(
    readonly file: string,
    keyFile = defaultKeyFile(),
  ) {
    this.#key = loadKey(keyFile);
    if (!existsSync(file)) {
      this.#data = {};
      return;
    }
    const stored = JSON.parse(readFileSync(file, "utf8")) as Scopes | Sealed;
    if (isSealed(stored)) {
      this.#data = this.#open(stored, keyFile);
    } else {
      this.#data = stored;
      this.#save();
    }
  }

  #open(sealed: Sealed, keyFile: string): Scopes {
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(sealed.iv, "base64"));
      decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
      const text = decipher.update(sealed.data, "base64", "utf8") + decipher.final("utf8");
      return JSON.parse(text) as Scopes;
    } catch {
      throw new Error(
        `Can't open ${this.file} with the key in ${keyFile}. After restoring on another computer, delete ` +
          `that file and enter the source's credentials again (see the backup runbook).`,
      );
    }
  }

  #seal(): Sealed {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(this.#data), "utf8"), cipher.final()]);
    return {
      sealed: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
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
    writeFileSync(tmp, `${JSON.stringify(this.#seal(), null, 2)}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.file);
  }
}

/** The store for one adapter: `<NodeCG root>/db/source-secrets/<sourceId>.json`. */
export function secretStoreFor(sourceId: string, root = process.cwd()): SecretStore {
  return new SecretStore(path.join(root, "db", "source-secrets", `${sourceId}.json`));
}
