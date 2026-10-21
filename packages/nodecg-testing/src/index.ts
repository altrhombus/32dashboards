import { EventEmitter } from "node:events";
import type NodeCG from "nodecg/types";

/*
 * A minimal stand-in for NodeCG's server API: just the parts extensions in
 * this repo use (Replicants, Messages, log, extensions, Router/mount).
 * Replicants hold plain values and emit "change" on assignment; there's no
 * schema validation, persistence, or proxying.
 *
 * Several fakes can share one `world` to stand in for several bundles in
 * one NodeCG: Replicants are keyed by namespace, so one bundle can read
 * another's, and `extensions` is shared.
 */

export class FakeReplicant<T> extends EventEmitter {
  #value: T;

  constructor(value: T) {
    super();
    this.#value = value;
  }

  get value(): T {
    return this.#value;
  }

  set value(next: T) {
    const old = this.#value;
    this.#value = next;
    this.emit("change", next, old);
  }
}

type Handler = (data: unknown, ack?: NodeCG.Acknowledgement) => void;

export interface FakeWorld {
  replicants: Map<string, FakeReplicant<unknown>>;
  handlers: Map<string, Handler[]>;
  extensions: Record<string, unknown>;
  /** Messages extensions sent with `nodecg.sendMessage`, oldest first. */
  sent: { bundleName: string; messageName: string; data: unknown }[];
  logs: { bundleName: string; level: string; message: string }[];
  mounts: unknown[];
}

export function createFakeWorld(): FakeWorld {
  return { replicants: new Map(), handlers: new Map(), extensions: {}, sent: [], logs: [], mounts: [] };
}

export interface FakeNodecg {
  api: NodeCG.ServerAPI;
  world: FakeWorld;
  /** A Replicant already declared in `namespace` (defaults to this bundle). */
  replicant<T>(name: string, namespace?: string): FakeReplicant<T>;
  /** Delivers a Message the way a panel's sendMessage would, resolving with the ack's value. */
  send(name: string, data: unknown): Promise<unknown>;
  logs: FakeWorld["logs"];
}

export function createFakeNodecg(bundleName = "fundraiser-core", world: FakeWorld = createFakeWorld()): FakeNodecg {
  const key = (namespace: string, name: string) => `${namespace}:${name}`;
  const logAt =
    (level: string) =>
    (...args: unknown[]) =>
      world.logs.push({ bundleName, level, message: args.map(String).join(" ") });

  const api = {
    bundleName,
    extensions: world.extensions,
    log: {
      trace: logAt("trace"),
      debug: logAt("debug"),
      info: logAt("info"),
      warn: logAt("warn"),
      error: logAt("error"),
    },
    Replicant(
      name: string,
      namespaceOrOpts?: string | { defaultValue?: unknown },
      maybeOpts?: { defaultValue?: unknown },
    ) {
      const namespace = typeof namespaceOrOpts === "string" ? namespaceOrOpts : bundleName;
      const opts = typeof namespaceOrOpts === "string" ? maybeOpts : namespaceOrOpts;
      let replicant = world.replicants.get(key(namespace, name));
      if (!replicant) {
        replicant = new FakeReplicant(opts?.defaultValue);
        world.replicants.set(key(namespace, name), replicant);
      } else if (replicant.value === undefined && opts && "defaultValue" in opts) {
        replicant.value = opts.defaultValue;
      }
      return replicant;
    },
    listenFor(name: string, handler: Handler) {
      const k = key(bundleName, name);
      world.handlers.set(k, [...(world.handlers.get(k) ?? []), handler]);
    },
    sendMessage(messageName: string, data?: unknown) {
      world.sent.push({ bundleName, messageName, data });
    },
    Router() {
      const routes: { method: string; path: string; handlers: unknown[] }[] = [];
      const add =
        (method: string) =>
        (path: string, ...handlers: unknown[]) =>
          routes.push({ method, path, handlers });
      return { routes, get: add("get"), post: add("post"), put: add("put"), delete: add("delete"), use: add("use") };
    },
    mount(...args: unknown[]) {
      world.mounts.push(args);
    },
  };

  return {
    api: api as unknown as NodeCG.ServerAPI,
    world,
    replicant<T>(name: string, namespace = bundleName) {
      const replicant = world.replicants.get(key(namespace, name));
      if (!replicant) throw new Error(`Replicant ${namespace}:${name} was never declared`);
      return replicant as FakeReplicant<T>;
    },
    send(name, data) {
      const list = world.handlers.get(key(bundleName, name));
      if (!list?.length) return Promise.reject(new Error(`No listener for ${bundleName}:${name}`));
      return new Promise((resolve, reject) => {
        const ack = Object.assign(
          (err: unknown, value?: unknown) => {
            ack.handled = true;
            if (err) reject(err);
            else resolve(value);
          },
          { handled: false },
        );
        for (const handler of list) handler(data, ack as unknown as NodeCG.Acknowledgement);
        // A handler that never acks would hang the test; fail it instead.
        if (!ack.handled) setTimeout(() => !ack.handled && reject(new Error(`${name} was never acked`)), 1000);
      });
    },
    logs: world.logs,
  };
}
