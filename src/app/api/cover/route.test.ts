import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { GET } from "./route";

const originalFetch = globalThis.fetch;
const runtime = globalThis as typeof globalThis & {
  __moonlitCoverCache?: Map<string, unknown>;
  __moonlitCoverRequests?: Map<string, unknown>;
};
const png = Buffer.concat([
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
  Buffer.alloc(2400),
]);
const request = (image: string, id = "") =>
  new Request(
    `https://moonlit.wastu.net/api/cover?url=${encodeURIComponent(image)}${id ? `&v=${id}` : ""}`,
  );
beforeEach(() => {
  runtime.__moonlitCoverCache?.clear();
  runtime.__moonlitCoverRequests?.clear();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("CDN errors, HTML, corrupt and empty responses recover to a real image", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert(init.signal instanceof AbortSignal);
    if (url.includes("googleusercontent"))
      throw new DOMException("CDN timeout", "TimeoutError");
    if (url.includes("maxresdefault"))
      return new Response("upstream error", { headers: { "Content-Type": "text/html" } });
    if (url.includes("sddefault"))
      return new Response(new Uint8Array(3000), {
        headers: { "Content-Type": "image/jpeg" },
      });
    if (url.includes("hq720"))
      return new Response(null, { headers: { "Content-Type": "image/jpeg" } });
    if (url.includes("hqdefault"))
      return new Response(new Uint8Array(100), {
        headers: { "Content-Type": "image/jpeg" },
      });
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  }) as typeof fetch;
  const response = await GET(
    request("https://lh3.googleusercontent.com/expired=w1200-h1200", "7WQqDRO70tA"),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert(calls.some((url) => url.includes("mqdefault")));
});

test("concurrent cover requests share a fetch and cache only successful image results", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  }) as typeof fetch;
  const image = "https://i.ytimg.com/vi/7WQqDRO70tA/maxresdefault.jpg";
  const responses = await Promise.all([GET(request(image)), GET(request(image))]);
  assert(responses.every((response) => response.status === 200));
  assert.equal((await GET(request(image))).status, 200);
  assert.equal(calls, 1);
});

test("failed artwork is not cached and disallowed hosts or redirects are not followed", async () => {
  let calls = 0;
  globalThis.fetch = (async (_input, init) => {
    calls++;
    assert.equal(init.redirect, "manual");
    return new Response(null, {
      status: 302,
      headers: { Location: "http://localhost/private" },
    });
  }) as typeof fetch;
  assert.equal((await GET(request("http://localhost/private"))).status, 400);
  assert.equal(calls, 0);
  const image = "https://lh3.googleusercontent.com/missing";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await GET(request(image));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls, 2);
  assert.equal(runtime.__moonlitCoverCache.size, 0);
});
