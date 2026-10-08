import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { AudioError, publicError } from "./errors.mjs";
import { credentialScope } from "./jobs.mjs";

const HEALTH_TTL = 600000;
const RETRY_DELAY = 60000;

/** One owner for search caching, capability evidence and recovery probes. */
export class YouTubeService {
  constructor({ store, provider, jobs }) {
    Object.assign(this, { store, provider, jobs });
    this.cache = new Map();
    this.pending = new Map();
    this.probes = new Map();
    this.controller = new AbortController();
  }

  async search(
    credentials,
    query,
    { includeVideos = false, limit, bypassCache = false } = {},
  ) {
    const scope = credentialScope(credentials.mode, credentials.cookies);
    const key = JSON.stringify([scope, query, includeVideos, limit]);
    const cached = this.cache.get(key);
    if (!bypassCache && cached?.expiresAt > Date.now())
      return { results: cached.results, cached: true };
    if (this.pending.has(key)) return this.pending.get(key);
    const health = this.store.health("search:" + scope);
    if (
      !bypassCache &&
      (health.recentFailures || []).filter((at) => at > Date.now() - 120000).length >= 4
    )
      throw new AudioError(
        "YOUTUBE_UNAVAILABLE",
        "YouTube is temporarily unavailable. Please try again shortly.",
        { status: 503 },
      );
    const request = (async () => {
      try {
        const results = await this.provider.search(
          {
            id: randomBytes(16).toString("hex"),
            scope,
            cookies: credentials.cookies,
            query,
            includeVideos,
            limit,
          },
          AbortSignal.any([this.controller.signal, AbortSignal.timeout(40000)]),
        );
        this.store.outcome("search:" + scope, null, { retainFailures: false });
        if (results.length) {
          this.cache.delete(key);
          this.cache.set(key, { results, expiresAt: Date.now() + 1800000 });
          while (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
        }
        return { results, cached: false };
      } catch (error) {
        this.store.outcome("search:" + scope, publicError(error));
        throw error;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, request);
    return request;
  }

  capability(scope, kind) {
    const health = this.store.health(kind === "search" ? "search:" + scope : scope);
    const expiresAt = health.checkedAt + HEALTH_TTL;
    return {
      ...health,
      state: expiresAt > Date.now() ? health.state : "unknown",
      expiresAt,
    };
  }

  schedule(key, probe) {
    if (this.controller.signal.aborted) return;
    const previous = this.probes.get(key);
    if (previous?.pending || previous?.at > Date.now() - RETRY_DELAY) return;
    const record = { at: Date.now(), pending: true };
    this.probes.set(key, record);
    void probe()
      .catch(() => {})
      .finally(() => {
        record.pending = false;
      });
  }

  async probePlayback(credentials) {
    let job;
    try {
      job = this.jobs.create("dQw4w9WgXcQ", credentials.mode, credentials.cookies, {
        bypassCache: true,
      });
      const signal = AbortSignal.any([
        this.controller.signal,
        AbortSignal.timeout(30000),
      ]);
      while (!["ready", "failed", "cancelled"].includes(job.state)) {
        await delay(500, undefined, { signal });
        job = { ...this.jobs.get(job.jobId, job.leaseId), leaseId: job.leaseId };
      }
    } finally {
      if (job?.leaseId && job.state !== "ready") this.jobs.cancel(job.jobId, job.leaseId);
    }
  }

  status(credentials) {
    const scope = credentialScope(credentials.mode, credentials.cookies);
    const search = this.capability(scope, "search");
    const playback = this.capability(scope, "playback");
    for (const [kind, health] of [
      ["search", search],
      ["playback", playback],
    ]) {
      if (kind === "playback" && credentials.mode === "user") continue;
      if (
        health.state === "unknown" ||
        (health.state === "degraded" && health.checkedAt < Date.now() - RETRY_DELAY)
      )
        this.schedule(kind + ":" + scope, () =>
          kind === "search"
            ? this.search(credentials, "lofi hip hop", {
                includeVideos: true,
                limit: 1,
                bypassCache: true,
              })
            : this.probePlayback(credentials),
        );
    }
    const states = [search.state, playback.state];
    const state = states.every((s) => s === "healthy")
      ? "healthy"
      : states.every((s) => s === "degraded")
        ? "offline"
        : states.includes("degraded")
          ? "degraded"
          : "unknown";
    return {
      state,
      online: state === "healthy",
      searchOk: search.state === "healthy",
      extractOk: playback.state === "healthy",
      cookieSource: credentials.mode === "anonymous" ? "none" : credentials.mode,
      capabilities: { search, playback },
      checkedAt: Math.min(search.checkedAt, playback.checkedAt),
      expiresAt: Math.max(
        Date.now() + 5000,
        Math.min(search.expiresAt, playback.expiresAt),
      ),
      ...(playback.error || search.error || {}),
      ...(playback.lastItemError ? { lastItemError: playback.lastItemError } : {}),
      retryAfterMs: state === "healthy" ? 30000 : 10000,
    };
  }

  close() {
    this.controller.abort();
    return Promise.allSettled([...this.pending.values()]);
  }
}
