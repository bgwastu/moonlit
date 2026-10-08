import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Agent, fetch as directFetch } from "undici";
import type { YoutubeCredentials } from "@/lib/youtubeCredentials";

const direct = new Agent({ headersTimeout: 45000, bodyTimeout: 0 });

function secret() {
  if (process.env.AUDIO_WORKER_SECRET) return process.env.AUDIO_WORKER_SECRET;
  const file = path.join(process.cwd(), "data", ".audio-worker-secret");
  try {
    return readFileSync(file, "utf8").trim();
  } catch {}
  mkdirSync(path.dirname(file), { recursive: true });
  const value = randomBytes(32).toString("hex");
  try {
    writeFileSync(file, value, { flag: "wx", mode: 0o600 });
    return value;
  } catch {
    return readFileSync(file, "utf8").trim();
  }
}

export type AudioJob = {
  jobId: string;
  kind?: "audio" | "video";
  leaseId?: string;
  videoId: string;
  state:
    | "queued"
    | "resolving"
    | "downloading"
    | "validating"
    | "ready"
    | "failed"
    | "cancelled";
  percent: number;
  cached?: boolean;
  asset?: {
    id: string;
    size: number;
    duration: number;
    contentType: string;
    metadata: {
      title: string;
      author: string;
      artist?: string;
      thumbnail: string;
      isAudioTrackVideo?: boolean;
    };
  };
  error?: {
    code: string;
    error: string;
    status: number;
    retryable?: boolean;
    affectsHealth?: boolean;
  };
};

export async function workerRequest(
  endpoint: string,
  init: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    media?: boolean;
    timeoutMs?: number;
  } = {},
) {
  try {
    const res = await directFetch(
      new URL(endpoint, process.env.AUDIO_WORKER_URL || "http://127.0.0.1:3010"),
      {
        method: init.method || "GET",
        body: init.body,
        dispatcher: direct,
        headers: {
          Authorization: `Bearer ${secret()}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        signal: init.media
          ? init.signal
          : init.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(init.timeoutMs || 10000)])
            : AbortSignal.timeout(init.timeoutMs || 10000),
      },
    );
    return res;
  } catch (error) {
    if (init.signal?.aborted) throw init.signal.reason;
    throw Object.assign(
      new Error("The audio service is unavailable. Please try again shortly."),
      { code: "AUDIO_SERVICE_UNAVAILABLE", status: 503 },
    );
  }
}

export async function workerJson<T>(
  endpoint: string,
  init: Parameters<typeof workerRequest>[1] = {},
): Promise<T> {
  const res = await workerRequest(endpoint, init);
  const body = (await res.json()) as any;
  if (!res.ok)
    throw Object.assign(new Error(body.error || "The audio service failed."), {
      code: body.code || "AUDIO_SERVICE_UNAVAILABLE",
      status: res.status,
    });
  return body as T;
}

export const createMediaJob = (
  kind: "audio" | "video",
  videoId: string,
  credentials: YoutubeCredentials,
  signal?: AbortSignal,
) =>
  workerJson<AudioJob>("/v1/jobs", {
    method: "POST",
    body: JSON.stringify({
      videoId,
      kind,
      mode: credentials.mode,
      cookies: credentials.cookies,
    }),
    signal,
  });
