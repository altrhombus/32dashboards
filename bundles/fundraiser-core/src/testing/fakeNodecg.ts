import { EventEmitter } from "node:events";
import type NodeCG from "nodecg/types";

/*
 * A minimal stand-in for NodeCG's server API: just the parts extensions in
 * this repo use (Replicants, listenFor, log, extensions). Replicants hold
 * plain values and emit "change" on assignment; there's no schema
 * validation, persistence, or proxying.
 */

class FakeReplicant<T> extends EventEmitter {
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

export interface FakeNodecg {
  api: NodeCG.ServerAPI;
  replicant<T>(name: string): FakeReplicant<T>;
  /** Delivers a Message the way a panel's sendMessage would, resolving with the ack's value. */
  send(name: string, data: unknown): Promise<unknown>;
  logs: { level: string; message: string }[];
}

export function createFakeNodecg(): FakeNodecg {
  const replicants = new Map<string, FakeReplicant<unknown>>();
  const handlers = new Map<string, Handler[]>();
  const logs: FakeNodecg["logs"] = [];
  const logAt =
    (level: string) =>
    (...args: unknown[]) =>
      logs.push({ level, message: args.map(String).join(" ") });

  const api = {
    bundleName: "fundraiser-core",
    extensions: {},
    log: { trace: logAt("trace"), debug: logAt("debug"), info: logAt("info"), warn: logAt("warn"), error: logAt("error") },
    Replicant(name: string, opts?: { defaultValue?: unknown }) {
      let replicant = replicants.get(name);
      if (!replicant) {
        replicant = new FakeReplicant(opts?.defaultValue);
        replicants.set(name, replicant);
      }
      return replicant;
    },
    listenFor(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
  };

  return {
    api: api as unknown as NodeCG.ServerAPI,
    replicant<T>(name: string) {
      const replicant = replicants.get(name);
      if (!replicant) throw new Error(`Replicant ${name} was never declared`);
      return replicant as FakeReplicant<T>;
    },
    send(name, data) {
      const list = handlers.get(name);
      if (!list?.length) return Promise.reject(new Error(`No listener for ${name}`));
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
      });
    },
    logs,
  };
}
