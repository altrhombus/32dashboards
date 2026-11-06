const realFetch = globalThis.fetch;

// Tests point the scraper at a closed port. Under WSL's mirrored networking a closed loopback port
// hangs rather than refuses, so answer the way a closed port should instead of timing out.
globalThis.fetch = (input, init) =>
  String(input).startsWith("http://127.0.0.1:39999")
    ? Promise.reject(new TypeError("fetch failed"))
    : realFetch(input, init);
