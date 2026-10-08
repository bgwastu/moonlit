import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { AudioError, publicError } from "./errors.mjs";
import { validateAudio, validateVideo } from "./validate.mjs";

const id = () => randomBytes(16).toString("hex");
const pendingStates = new Set(["queued", "resolving", "downloading", "validating"]);

export function credentialScope(mode, cookies = "") {
  return mode === "anonymous"
    ? "anonymous"
    : createHash("sha256").update(`${mode}\0${cookies}`).digest("hex");
}

export class AudioJobs {
  constructor({
    store,
    provider,
    directory,
    kind = "audio",
    concurrency = 2,
    queueLimit = 24,
    maxBytes = 128 * 1024 * 1024,
    maxDuration = 7200,
    cacheBytes = 2 * 1024 ** 3,
    cacheTtlMs = 86400000,
    jobTimeoutMs = 180000,
    leaseTtlMs = 60000,
    validate = kind === "video" ? validateVideo : validateAudio,
  }) {
    Object.assign(this, {
      store,
      provider,
      directory,
      kind,
      concurrency,
      queueLimit,
      maxBytes,
      maxDuration,
      cacheBytes,
      cacheTtlMs,
      jobTimeoutMs,
      leaseTtlMs,
      validate,
    });
    this.extension = kind === "video" ? "mp4" : "m4a";
    this.contentType = kind === "video" ? "video/mp4" : "audio/mp4";
    this.assetsDir = path.join(directory, kind === "video" ? "video-assets" : "assets");
    this.stagingDir = path.join(
      directory,
      kind === "video" ? "video-staging" : "staging",
    );
    mkdirSync(this.assetsDir, { recursive: true });
    mkdirSync(this.stagingDir, { recursive: true });
    this.running = new Map();
    this.queue = [];
    this.credentials = new Map();
    this.leases = new Map();
    this.readers = new Map();
    this.closing = false;
    this.cacheMutation = Promise.resolve();
    this.timer = setInterval(() => this.maintenance().catch(() => {}), 5000);
    this.timer.unref();
  }

  assetPath(assetId) {
    return path.join(this.assetsDir, `${assetId}.${this.extension}`);
  }

  create(videoId, mode = "anonymous", cookies = "", { bypassCache = false } = {}) {
    if (this.closing)
      throw new AudioError(
        `${this.kind.toUpperCase()}_BUSY`,
        "The playback service is restarting.",
        {
          status: 503,
          affectsHealth: false,
        },
      );
    const scope = credentialScope(mode, cookies);
    // Preserve existing audio keys and assets across upgrades.
    const cacheKey = createHash("sha256")
      .update(`${this.kind === "video" ? "video:" : ""}${scope}:${videoId}`)
      .digest("hex");
    const cached = !bypassCache && this.store.cachedAsset(cacheKey);
    if (
      cached &&
      cached.createdAt > Date.now() - this.cacheTtlMs &&
      existsSync(this.assetPath(cached.id)) &&
      statSync(this.assetPath(cached.id)).size === cached.size
    ) {
      cached.accessedAt = Date.now();
      this.store.putAsset(cached);
      const job = {
        id: id(),
        kind: this.kind,
        videoId,
        scope,
        cacheKey,
        state: "ready",
        updatedAt: Date.now(),
        asset: cached,
        cached: true,
      };
      this.store.putJob(job);
      console.log(
        JSON.stringify({ event: `${this.kind}_cache_hit`, videoId, bytes: cached.size }),
      );
      return this.publicJob(job);
    }
    let job = this.store.pendingJob(cacheKey);
    if (!job) {
      if (this.queue.length + this.running.size >= this.queueLimit)
        throw new AudioError(
          `${this.kind.toUpperCase()}_BUSY`,
          "The playback service is busy. Please try again shortly.",
          { status: 503, affectsHealth: false },
        );
      job = {
        id: id(),
        kind: this.kind,
        videoId,
        scope,
        cacheKey,
        state: "queued",
        updatedAt: Date.now(),
        percent: 0,
      };
      this.store.putJob(job);
      this.credentials.set(job.id, cookies);
      this.queue.push(job.id);
    }
    const leaseId = id();
    if (!this.leases.has(job.id)) this.leases.set(job.id, new Map());
    this.leases.get(job.id).set(leaseId, Date.now());
    queueMicrotask(() => this.drain());
    return { ...this.publicJob(job), leaseId };
  }

  publicJob(job) {
    if (!job) return null;
    return {
      jobId: job.id,
      kind: job.kind || "audio",
      videoId: job.videoId,
      state: job.state,
      percent: job.percent || 0,
      bytes: job.bytes || 0,
      totalBytes: job.totalBytes || 0,
      cached: Boolean(job.cached),
      ...(job.asset
        ? {
            asset: {
              id: job.asset.id,
              size: job.asset.size,
              duration: job.asset.duration,
              contentType: job.asset.contentType || "audio/mp4",
              metadata: job.asset.metadata,
            },
          }
        : {}),
      ...(job.error ? { error: job.error } : {}),
    };
  }

  get(jobId, leaseId) {
    const job = this.store.getJob(jobId);
    if (!job) return null;
    const leases = this.leases.get(jobId);
    if (leaseId && leases?.has(leaseId)) leases.set(leaseId, Date.now());
    return this.publicJob(job);
  }

  cancel(jobId, leaseId) {
    const leases = this.leases.get(jobId);
    if (!leaseId || !leases?.delete(leaseId)) return;
    if (!leases.size) this.cancelJob(jobId);
  }

  cancelJob(jobId) {
    const job = this.store.getJob(jobId);
    if (!job || !pendingStates.has(job.state)) return;
    this.running.get(jobId)?.abort();
    this.queue = this.queue.filter((value) => value !== jobId);
    this.credentials.delete(jobId);
    this.leases.delete(jobId);
    this.store.putJob({
      ...job,
      state: "cancelled",
      updatedAt: Date.now(),
      error: publicError(new DOMException("Cancelled", "AbortError")),
    });
  }

  drain() {
    if (this.closing) return;
    while (this.running.size < this.concurrency && this.queue.length) {
      const job = this.store.getJob(this.queue.shift());
      if (!job || !pendingStates.has(job.state)) continue;
      const controller = new AbortController();
      this.running.set(job.id, controller);
      this.run(job, controller).finally(() => {
        this.running.delete(job.id);
        this.drain();
      });
    }
  }

  async run(job, controller) {
    const startedAt = Date.now();
    const inputPath = path.join(this.stagingDir, `${job.id}.input`);
    const outputPath = path.join(this.stagingDir, `${job.id}.part`);
    const timeout = setTimeout(
      () =>
        controller.abort(
          new AudioError(
            this.kind === "video" ? "VIDEO_TIMEOUT" : "AUDIO_TIMEOUT",
            `${this.kind === "video" ? "Video" : "Audio"} preparation took too long. Please try again.`,
            { status: 504, retryable: true },
          ),
        ),
      this.jobTimeoutMs,
    );
    let published;
    let firstAudioAt;
    let retries = 0;
    try {
      const cookies = this.credentials.get(job.id) || "";
      this.credentials.delete(job.id);
      const result = await this.provider.download(
        {
          id: job.id,
          kind: this.kind,
          videoId: job.videoId,
          scope: job.scope,
          cookies,
          inputPath,
          maxBytes: this.maxBytes,
          maxDuration: this.maxDuration,
        },
        (progress) => {
          if (controller.signal.aborted) return;
          if (progress.bytes > 0 && !firstAudioAt) firstAudioAt = Date.now();
          if (progress.retrying) {
            retries++;
            console.log(
              JSON.stringify({
                event: `${this.kind}_retry`,
                videoId: job.videoId,
                code: progress.code,
              }),
            );
          }
          const { type: _type, id: _id, ...data } = progress;
          job = { ...job, ...data, updatedAt: Date.now() };
          this.store.putJob(job);
        },
        controller.signal,
      );
      controller.signal.throwIfAborted();
      job = { ...job, state: "validating", percent: 97, updatedAt: Date.now() };
      this.store.putJob(job);
      const duration = await this.validate(
        inputPath,
        outputPath,
        result.duration,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      const size = statSync(outputPath).size;
      if (!size || size > this.maxBytes)
        throw new AudioError(
          "TRACK_TOO_LARGE",
          `The processed ${this.kind} exceeded the cache limit.`,
          { status: 422, affectsHealth: false },
        );
      const asset = {
        id: id(),
        kind: this.kind,
        contentType: this.contentType,
        cacheKey: job.cacheKey,
        size,
        duration,
        metadata: result.metadata,
        createdAt: Date.now(),
        accessedAt: Date.now(),
      };
      await this.withCacheLock(async () => {
        await this.evictInternal(size);
        await rename(outputPath, this.assetPath(asset.id));
        published = asset;
        controller.signal.throwIfAborted();
        this.store.putAsset(asset);
      });
      this.store.putJob({
        ...job,
        state: "ready",
        asset,
        percent: 100,
        updatedAt: Date.now(),
      });
      if (this.kind === "audio") this.store.outcome(job.scope, null);
      console.log(
        JSON.stringify({
          event: `${this.kind}_ready`,
          videoId: job.videoId,
          bytes: size,
          elapsedMs: Date.now() - startedAt,
          firstAudioMs: firstAudioAt ? firstAudioAt - startedAt : undefined,
          retries,
        }),
      );
    } catch (error) {
      const failure = publicError(
        controller.signal.aborted ? controller.signal.reason : error,
      );
      if (this.kind === "video") failure.affectsHealth = false;
      this.store.putJob({
        ...job,
        state: failure.code === "CANCELLED" ? "cancelled" : "failed",
        updatedAt: Date.now(),
        error: failure,
      });
      if (this.kind === "audio") this.store.outcome(job.scope, failure);
      if (published) {
        await rm(this.assetPath(published.id), { force: true });
        this.store.removeAsset(published.id);
      }
      console.log(
        JSON.stringify({
          event: `${this.kind}_failed`,
          videoId: job.videoId,
          code: failure.code,
          elapsedMs: Date.now() - startedAt,
        }),
      );
    } finally {
      clearTimeout(timeout);
      this.leases.delete(job.id);
      await Promise.all([inputPath, outputPath].map((file) => rm(file, { force: true })));
    }
  }

  async withCacheLock(fn) {
    const previous = this.cacheMutation;
    let release;
    this.cacheMutation = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  evict(required = 0) {
    return this.withCacheLock(() => this.evictInternal(required));
  }

  async evictInternal(required = 0) {
    const assets = this.store
      .assets()
      .filter((asset) => (asset.kind || "audio") === this.kind);
    let size = assets.reduce((sum, asset) => sum + asset.size, 0);
    for (const asset of assets) {
      const expired = asset.createdAt < Date.now() - this.cacheTtlMs;
      if (!expired && size + required <= this.cacheBytes) continue;
      if (this.readers.has(asset.id)) continue;
      await rm(this.assetPath(asset.id), { force: true });
      this.store.removeAsset(asset.id);
      size -= asset.size;
    }
    if (size + required > this.cacheBytes)
      throw new AudioError(
        `${this.kind.toUpperCase()}_CACHE_FULL`,
        `The ${this.kind} cache is busy. Please try again shortly.`,
        { status: 503, affectsHealth: false },
      );
  }

  async maintenance() {
    this.provider.reapIdle?.();
    for (const [jobId, leases] of this.leases) {
      for (const [leaseId, at] of leases)
        if (at < Date.now() - this.leaseTtlMs) leases.delete(leaseId);
      if (!leases.size) this.cancelJob(jobId);
    }
    this.store.pruneJobs();
    await this.evict();
  }

  async cleanStaging() {
    for (const file of await readdir(this.stagingDir))
      await rm(path.join(this.stagingDir, file), { force: true });
    const known = new Set(
      this.store
        .assets()
        .filter((asset) => (asset.kind || "audio") === this.kind)
        .map((asset) => `${asset.id}.${this.extension}`),
    );
    for (const file of await readdir(this.assetsDir))
      if (!known.has(file)) await rm(path.join(this.assetsDir, file), { force: true });
  }

  stop() {
    this.closing = true;
    clearInterval(this.timer);
    for (const jobId of [...this.queue, ...this.running.keys()]) this.cancelJob(jobId);
  }

  async close({ closeProvider = true } = {}) {
    this.stop();
    if (closeProvider) await this.provider.close();
    // Provider termination settles active downloads; let their cleanup finish.
    while (this.running.size) await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
