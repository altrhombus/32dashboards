import { describe, expect, it } from "vitest";
import { HttpError, fetchText } from "./http.js";

const noSleep = async () => {};

function fakeFetch(responses: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("fetchText", () => {
  it("returns the body and sends headers", async () => {
    const { impl, calls } = fakeFetch([new Response("hello")]);
    await expect(fetchText("https://x.test/", { fetchImpl: impl, headers: { cookie: "a=b" } })).resolves.toBe("hello");
    expect(calls[0]?.init?.headers).toEqual({ cookie: "a=b" });
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries network errors, then succeeds", async () => {
    const { impl, calls } = fakeFetch([new TypeError("fetch failed"), new TypeError("fetch failed"), new Response("ok")]);
    await expect(fetchText("https://x.test/", { fetchImpl: impl, sleep: noSleep })).resolves.toBe("ok");
    expect(calls).toHaveLength(3);
  });

  it("gives up after the retry budget", async () => {
    const { impl, calls } = fakeFetch([new TypeError("a"), new TypeError("b"), new TypeError("c")]);
    await expect(fetchText("https://x.test/", { fetchImpl: impl, sleep: noSleep })).rejects.toThrow("c");
    expect(calls).toHaveLength(3);
  });

  it("does not retry HTTP errors", async () => {
    const { impl, calls } = fakeFetch([new Response("nope", { status: 503 })]);
    await expect(fetchText("https://x.test/", { fetchImpl: impl, sleep: noSleep })).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it("stops retrying once the caller aborts", async () => {
    const controller = new AbortController();
    const { impl, calls } = fakeFetch([new TypeError("a"), new Response("late")]);
    const sleep = async () => controller.abort(new Error("switched events"));
    await expect(fetchText("https://x.test/", { fetchImpl: impl, sleep, signal: controller.signal })).rejects.toThrow(
      "switched events",
    );
    expect(calls).toHaveLength(1);
  });
});
