import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { youtubeCookieHeader } from "./credentials.mjs";

const base = process.env.BENCHMARK_URL || "http://127.0.0.1:3010";
const dataDir = process.env.MOONLIT_DATA_DIR || path.join(process.cwd(), "data");
const secret =
  process.env.AUDIO_WORKER_SECRET ||
  readFileSync(path.join(dataDir, ".audio-worker-secret"), "utf8").trim();
const mode = process.env.BENCHMARK_MODE || "anonymous";
const cookies =
  mode === "anonymous"
    ? undefined
    : youtubeCookieHeader(
        readFileSync(
          process.env.BENCHMARK_COOKIES_PATH || path.join(dataDir, "cookies.txt"),
          "utf8",
        ),
      );
const tracks = process.env.BENCHMARK_VIDEO_IDS?.split(",") || [
  "dQw4w9WgXcQ",
  "JGwWNGJdvx8",
  "kJQP7kiw5Fk",
  "fJ9rUzIMcZQ",
  "hT_nvWreIhg",
  "09R8_2nJtjg",
  "OPf0YbXqDm0",
  "YQHsXMglC9A",
  "RgKAFK5djSk",
  "e-ORhEE9VVg",
  "nfWlot6h_JM",
  "pRpeEdMmmQ0",
  "CevxZvSJLk8",
  "y6120QOlsfU",
  "QkF3oxziUI4",
  "RBumgq5yVrA",
  "3AtDnEC4zak",
  "60ItHLz5WEA",
  "Zi_XLOBDo_Y",
  "oRdxUFDoQe0",
  "hTWKbfoikeg",
  "34Na4j8AVgA",
  "4NRXx6U8ABQ",
  "20zVdUxZdwg",
  "2Vv-BfVoq4g",
  "7wtfhZwyrcc",
  "4D7u5KF7SP8",
  "lYBUbBu4W08",
  "5qZQEq_C3vc",
  "S-nAEqC5pFA",
];
const headers = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
const request = async (endpoint, init = {}) => {
  const response = await fetch(new URL(endpoint, base), {
    ...init,
    headers,
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
};
const results = [];
const readyDeadline = Date.now() + 20000;
for (;;) {
  try {
    await request("/v1/health", {
      method: "POST",
      body: JSON.stringify({ mode: "anonymous" }),
    });
    break;
  } catch (error) {
    if (Date.now() >= readyDeadline) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
for (const videoId of tracks) {
  const startedAt = Date.now();
  let firstAudioMs;
  try {
    let job = await request("/v1/jobs", {
      method: "POST",
      body: JSON.stringify({ videoId, mode, cookies, bypassCache: true }),
    });
    const lease = job.leaseId;
    const deadline = Date.now() + 200000;
    while (!["ready", "failed", "cancelled"].includes(job.state)) {
      if (Date.now() > deadline) throw new Error("Benchmark timeout");
      await new Promise((resolve) => setTimeout(resolve, 500));
      job = await request(`/v1/jobs/${job.jobId}?lease=${lease || ""}`);
      if (!firstAudioMs && job.bytes > 0) firstAudioMs = Date.now() - startedAt;
    }
    const result = {
      videoId,
      mode,
      state: job.state,
      elapsedMs: Date.now() - startedAt,
      firstAudioMs,
      ...(job.asset
        ? {
            title: job.asset.metadata.title,
            author: job.asset.metadata.author,
            duration: job.asset.duration,
            bytes: job.asset.size,
          }
        : {}),
      ...(job.error ? { code: job.error.code, error: job.error.error } : {}),
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = {
      videoId,
      mode,
      state: "failed",
      elapsedMs: Date.now() - startedAt,
      error: error.message,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
const summary = {
  checkedAt: new Date().toISOString(),
  mode,
  total: results.length,
  ready: results.filter((r) => r.state === "ready").length,
  results,
};
writeFileSync(
  process.env.BENCHMARK_OUTPUT || path.join(dataDir, `benchmark-${mode}.json`),
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify({
    total: summary.total,
    ready: summary.ready,
    failed: summary.total - summary.ready,
  }),
);
