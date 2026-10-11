/** A non-2xx response. Not retried: the server answered, and retrying won't change its mind. */
export class HttpError extends Error {
  override name = "HttpError";

  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}

export interface FetchTextOptions {
  headers?: Record<string, string>;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Aborts the request and any retry wait, e.g. when the active event changes. */
  signal?: AbortSignal;
  /** Extra attempts after a network error or timeout. */
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * GETs a page as text. Every attempt has a timeout, and network errors and
 * timeouts are retried with exponential backoff (1s, 2s, 4s… capped at 10s),
 * the way the legacy Python scraper did with tenacity.
 */
export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<string> {
  const { headers, timeoutMs = 10_000, signal, retries = 2, fetchImpl = fetch, sleep = abortableSleep } = options;

  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const attemptSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetchImpl(url, { headers, signal: attemptSignal, redirect: "follow" });
      if (!response.ok) throw new HttpError(response.status, url);
      return await response.text();
    } catch (err) {
      if (err instanceof HttpError || signal?.aborted || attempt >= retries) throw err;
      await sleep(Math.min(1000 * 2 ** attempt, 10_000), signal);
    }
  }
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
