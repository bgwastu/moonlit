import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createReadStream,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { AudioError, publicError } from "./errors.mjs";
import { AudioJobs, credentialScope } from "./jobs.mjs";
import { SabrProvider } from "./provider.mjs";
import { parseByteRange } from "./ranges.mjs";
import { AudioStore } from "./store.mjs";

export function readWorkerSecret(dataDir) {
  if (process.env.AUDIO_WORKER_SECRET) return process.env.AUDIO_WORKER_SECRET;
  const file = path.join(dataDir, ".audio-worker-secret");
  mkdirSync(dataDir, { recursive: true });
  try {
    return readFileSync(file, "utf8").trim();
  } catch {}
  const secret = randomBytes(32).toString("hex");
  try {
    writeFileSync(file, secret, { flag: "wx", mode: 0o600 });
    return secret;
  } catch {
    return readFileSync(file, "utf8").trim();
  }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536)
      throw new AudioError("INVALID_REQUEST", "Request body is too large.", {
        status: 413,
        affectsHealth: false,
      });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AudioError("INVALID_REQUEST", "Invalid JSON request.", {
      status: 400,
      affectsHealth: false,
    });
  }
}

function json(res, body, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export async function createAudioService({
  directory,
  secret,
  provider = new SabrProvider(),
  videoOptions = {},
  ...options
}) {
  const store = new AudioStore(directory);
  const jobs = new AudioJobs({ store, provider, directory, ...options });
  // Optional video has its own capacity and cache; it cannot evict saved audio.
  const videoJobs = new AudioJobs({
    store,
    provider,
    directory,
    kind: "video",
    concurrency: 1,
    queueLimit: 8,
    maxBytes: 192 * 1024 ** 2,
    cacheBytes: 1024 ** 3,
    ...videoOptions,
  });
  await jobs.cleanStaging();
  await videoJobs.cleanStaging();
  const manager = (record) => (record?.kind === "video" ? videoJobs : jobs);
  const authorized = (req) => {
    const supplied = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  const server = createServer(async (req, res) => {
    if (!authorized(req)) {
      json(res, { error: "Unauthorized" }, 401);
      return;
    }
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "POST" && url.pathname === "/v1/jobs") {
        const body = await readJson(req);
        const mode = body.mode || "anonymous";
        const kind = body.kind || "audio";
        if (
          !/^[\w-]{11}$/.test(body.videoId || "") ||
          !["anonymous", "user", "system"].includes(mode) ||
          !["audio", "video"].includes(kind) ||
          (mode !== "anonymous" && (!body.cookies || /[\r\n]/.test(body.cookies)))
        ) {
          throw new AudioError("INVALID_REQUEST", "Invalid video or credential mode.", {
            status: 400,
            affectsHealth: false,
          });
        }
        const job = manager({ kind }).create(
          body.videoId,
          mode,
          mode === "anonymous" ? "" : body.cookies,
          { bypassCache: body.bypassCache === true },
        );
        json(res, job, job.state === "ready" ? 200 : 202);
        return;
      }
      const jobMatch = /^\/v1\/jobs\/([a-f0-9]{32})$/.exec(url.pathname);
      if (jobMatch && req.method === "GET") {
        const job = manager(store.getJob(jobMatch[1])).get(
          jobMatch[1],
          url.searchParams.get("lease"),
        );
        json(
          res,
          job || { error: "Job not found", code: "AUDIO_EXPIRED" },
          job ? 200 : 404,
        );
        return;
      }
      if (jobMatch && req.method === "DELETE") {
        manager(store.getJob(jobMatch[1])).cancel(
          jobMatch[1],
          url.searchParams.get("lease"),
        );
        json(res, { cancelled: true });
        return;
      }
      if (url.pathname === "/v1/health" && req.method === "POST") {
        const body = await readJson(req);
        const scope = credentialScope(body.mode || "anonymous", body.cookies || "");
        const health = store.health(scope);
        const now = Date.now();
        const state = health.checkedAt < now - 600000 ? "unknown" : health.state;
        json(res, {
          ...health,
          state,
          expiresAt: health.checkedAt + 600000,
          queued: jobs.queue.length,
          active: jobs.running.size,
          video: { queued: videoJobs.queue.length, active: videoJobs.running.size },
          provider: "sabr",
          versions: { youtubei: "18.1.0", googlevideo: "4.1.1", bgutils: "4.0.3" },
        });
        return;
      }
      const assetMatch = /^\/v1\/assets\/([a-f0-9]{32})$/.exec(url.pathname);
      if (assetMatch && (req.method === "GET" || req.method === "HEAD")) {
        const asset = store.getAsset(assetMatch[1]);
        if (!asset) {
          json(
            res,
            { error: "Media expired. Please reload this track.", code: "MEDIA_EXPIRED" },
            410,
          );
          return;
        }
        const assetJobs = manager(asset);
        const file = assetJobs.assetPath(asset.id);
        if (statSync(file).size !== asset.size)
          throw new AudioError(
            "MEDIA_INCOMPLETE",
            "Cached media is incomplete. Please reload this track.",
          );
        const range = parseByteRange(req.headers.range, asset.size);
        if (!range) {
          res.writeHead(416, { "Content-Range": `bytes */${asset.size}` });
          res.end();
          return;
        }
        asset.accessedAt = Date.now();
        store.putAsset(asset);
        res.writeHead(range.status, {
          "Content-Type": asset.contentType || "audio/mp4",
          "Accept-Ranges": "bytes",
          "Content-Length": range.end - range.start + 1,
          "Cache-Control": "private, no-store",
          ...(range.status === 206
            ? { "Content-Range": `bytes ${range.start}-${range.end}/${asset.size}` }
            : {}),
        });
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        assetJobs.readers.set(asset.id, (assetJobs.readers.get(asset.id) || 0) + 1);
        try {
          await pipeline(
            createReadStream(file, { start: range.start, end: range.end }),
            res,
          );
        } finally {
          const remaining = assetJobs.readers.get(asset.id) - 1;
          if (remaining) assetJobs.readers.set(asset.id, remaining);
          else assetJobs.readers.delete(asset.id);
        }
        return;
      }
      json(res, { error: "Not found" }, 404);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const failure = publicError(error);
      json(res, failure, failure.status);
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  let closing;
  return {
    server,
    jobs,
    videoJobs,
    store,
    async close() {
      if (!closing)
        closing = (async () => {
          server.close();
          jobs.stop();
          videoJobs.stop();
          await provider.close();
          await Promise.all([
            jobs.close({ closeProvider: false }),
            videoJobs.close({ closeProvider: false }),
          ]);
          server.closeAllConnections();
          store.close();
        })();
      return closing;
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.MOONLIT_DATA_DIR || path.join(process.cwd(), "data");
  const service = await createAudioService({
    directory: path.join(dataDir, "audio"),
    secret: readWorkerSecret(dataDir),
    concurrency: Number(process.env.AUDIO_CONCURRENCY || 2),
    cacheBytes: Number(process.env.AUDIO_CACHE_BYTES || 2 * 1024 ** 3),
    cacheTtlMs: Number(process.env.AUDIO_CACHE_TTL_HOURS || 24) * 3600000,
    maxDuration: Number(process.env.AUDIO_MAX_DURATION_SECONDS || 7200),
    videoOptions: {
      concurrency: Number(process.env.VIDEO_CONCURRENCY || 1),
      cacheBytes: Number(process.env.VIDEO_CACHE_BYTES || 1024 ** 3),
      cacheTtlMs: Number(process.env.VIDEO_CACHE_TTL_HOURS || 24) * 3600000,
      maxBytes: Number(process.env.VIDEO_MAX_BYTES || 192 * 1024 ** 2),
      maxDuration: Number(process.env.VIDEO_MAX_DURATION_SECONDS || 7200),
    },
  });
  service.server.listen(
    Number(process.env.AUDIO_WORKER_PORT || 3010),
    process.env.AUDIO_WORKER_HOST || "127.0.0.1",
    () => console.log("[Moonlit] Audio service ready"),
  );
  const stop = async () => {
    await service.close();
    process.exit(0);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
