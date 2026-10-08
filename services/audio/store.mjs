import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export class AudioStore {
  constructor(directory) {
    this.liveJobs = new Map();
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, "audio.sqlite"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, cache_key TEXT NOT NULL, scope TEXT NOT NULL,
        video_id TEXT NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS jobs_cache ON jobs(cache_key, state);
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, cache_key TEXT NOT NULL, size INTEGER NOT NULL,
        created_at INTEGER NOT NULL, accessed_at INTEGER NOT NULL, data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS assets_cache ON assets(cache_key, created_at);
      CREATE TABLE IF NOT EXISTS health (
        scope TEXT PRIMARY KEY, data TEXT NOT NULL
      );
    `);
    for (const row of this.db
      .prepare(
        "SELECT data FROM jobs WHERE state IN ('queued','resolving','downloading','validating')",
      )
      .all()) {
      const job = JSON.parse(row.data);
      this.putJob({
        ...job,
        state: "failed",
        updatedAt: Date.now(),
        error: {
          code: "WORKER_RESTARTED",
          error: "The audio service restarted. Please retry playback.",
          status: 503,
          retryable: true,
        },
      });
    }
  }

  putJob(job) {
    const previous = this.liveJobs.get(job.id);
    // Pollers see every progress update; only state transitions need restart recovery.
    if (previous?.state === job.state) {
      this.liveJobs.set(job.id, job);
      return;
    }
    this.db
      .prepare("INSERT OR REPLACE INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        job.id,
        job.cacheKey,
        job.scope,
        job.videoId,
        job.state,
        job.updatedAt,
        JSON.stringify(job),
      );
    this.liveJobs.set(job.id, job);
  }

  getJob(id) {
    if (this.liveJobs.has(id)) return this.liveJobs.get(id);
    const row = this.db.prepare("SELECT data FROM jobs WHERE id = ?").get(id);
    const job = row ? JSON.parse(row.data) : null;
    if (job) this.liveJobs.set(id, job);
    return job;
  }

  pendingJob(cacheKey) {
    const row = this.db
      .prepare(
        "SELECT id FROM jobs WHERE cache_key = ? AND state IN ('queued','resolving','downloading','validating') LIMIT 1",
      )
      .get(cacheKey);
    return row ? this.getJob(row.id) : null;
  }

  getAsset(id) {
    const row = this.db.prepare("SELECT data FROM assets WHERE id = ?").get(id);
    return row ? JSON.parse(row.data) : null;
  }

  cachedAsset(cacheKey) {
    const row = this.db
      .prepare(
        "SELECT data FROM assets WHERE cache_key = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(cacheKey);
    return row ? JSON.parse(row.data) : null;
  }

  putAsset(asset) {
    this.db
      .prepare("INSERT OR REPLACE INTO assets VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        asset.id,
        asset.cacheKey,
        asset.size,
        asset.createdAt,
        asset.accessedAt,
        JSON.stringify(asset),
      );
  }

  removeAsset(id) {
    this.db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  }

  assets() {
    return this.db
      .prepare("SELECT data FROM assets ORDER BY accessed_at ASC")
      .all()
      .map((row) => JSON.parse(row.data));
  }

  pruneJobs() {
    const cutoff = Date.now() - 86400000;
    for (const [id, job] of this.liveJobs)
      if (job.updatedAt < cutoff && ["ready", "failed", "cancelled"].includes(job.state))
        this.liveJobs.delete(id);
    this.db
      .prepare(
        "DELETE FROM jobs WHERE updated_at < ? AND state IN ('ready','failed','cancelled')",
      )
      .run(cutoff);
  }

  health(scope) {
    const row = this.db.prepare("SELECT data FROM health WHERE scope = ?").get(scope);
    return row
      ? JSON.parse(row.data)
      : { state: "unknown", checkedAt: 0, lastSuccessAt: 0, lastFailureAt: 0 };
  }

  outcome(scope, error, { cached = false, retainFailures = true } = {}) {
    const previous = this.health(scope);
    const now = Date.now();
    let next;
    if (!error) {
      // Cached media is usable, but it does not verify fresh access to YouTube.
      if (cached) return;
      next = {
        ...previous,
        state: "healthy",
        checkedAt: now,
        lastSuccessAt: now,
        error: null,
        recentFailures: retainFailures
          ? (previous.recentFailures || []).filter((at) => at > now - 300000)
          : [],
      };
      if (next.recentFailures.length) next.state = "degraded";
    } else if (error.affectsHealth !== false) {
      next = {
        ...previous,
        state: "degraded",
        checkedAt: now,
        lastFailureAt: now,
        error,
        recentFailures: [
          ...(previous.recentFailures || []).filter((at) => at > now - 300000),
          now,
        ].slice(-20),
      };
    } else {
      next = { ...previous, lastItemError: error, lastItemErrorAt: now };
    }
    this.db
      .prepare("INSERT OR REPLACE INTO health VALUES (?, ?)")
      .run(scope, JSON.stringify(next));
  }

  close() {
    this.db.close();
  }
}
