import { after } from "next/server";
import {
  AudioJob,
  audioHealth,
  audioProvider,
  workerJson,
  workerRequest,
} from "@/lib/audioWorker";
import { readRequestCookiesResult } from "@/lib/cookies";
import { enforceYouTubeStatusLimit } from "@/lib/rateLimitYouTube";
import { withYoutubeCircuit } from "@/lib/youtubeCircuit";
import { YoutubeCredentials, resolveYoutubeCredentials } from "@/lib/youtubeCredentials";
import { CapabilityHealth, readCapability, recordCapability } from "@/lib/youtubeHealth";
import { searchMusic, searchYouTube } from "@/lib/youtubei";

const probes = new Map<string, number>();

function schedule(key: string, probe: () => Promise<void>) {
  if ((probes.get(key) || 0) > Date.now() - 60000) return;
  probes.set(key, Date.now());
  after(async () => {
    try {
      await probe();
    } catch {
      /* Outcome is recorded by the probe. */
    }
  });
}

async function probeSearch(credentials: YoutubeCredentials) {
  try {
    await withYoutubeCircuit(async () => {
      const options = { cookies: credentials.cookies, limit: 1, bypassCache: true };
      const songs = await searchMusic("lofi hip hop", options);
      if (!songs.length) await searchYouTube("lofi hip hop", options);
    }, `search:${credentials.scope}`);
    await recordCapability(credentials.scope, "search");
  } catch (error) {
    await recordCapability(credentials.scope, "search", error).catch(() => {});
  }
}

async function probePlayback(credentials: YoutubeCredentials) {
  let job: AudioJob;
  try {
    job = await workerJson<AudioJob>("/v1/jobs", {
      method: "POST",
      body: JSON.stringify({
        videoId: "dQw4w9WgXcQ",
        mode: credentials.mode,
        cookies: credentials.cookies,
        bypassCache: true,
      }),
    });
    const deadline = Date.now() + 30000;
    while (
      !["ready", "failed", "cancelled"].includes(job.state) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const next = await workerJson<AudioJob>(
        `/v1/jobs/${job.jobId}?lease=${job.leaseId || ""}`,
      );
      job = { ...next, leaseId: job.leaseId };
    }
  } finally {
    if (job?.leaseId && job.state !== "ready")
      await workerRequest(`/v1/jobs/${job.jobId}?lease=${job.leaseId}`, {
        method: "DELETE",
      }).catch(() => {});
  }
}

export async function GET(request: Request) {
  const supplied = readRequestCookiesResult(request);
  if (supplied.status === "invalid")
    return Response.json({
      state: "degraded",
      online: false,
      searchOk: false,
      extractOk: false,
      cookieSource: "user",
      code: "INVALID_COOKIES",
      error: supplied.error,
      expiresAt: Date.now() + 15000,
    });
  const limited = enforceYouTubeStatusLimit(
    request,
    supplied.status === "ok" ? "user" : "system",
  );
  if (limited) return limited;
  try {
    const credentials = await resolveYoutubeCredentials(
      supplied.status === "ok" ? supplied.cookies : undefined,
    );
    const search = await readCapability(credentials.scope, "search");
    if (search.state === "unknown")
      schedule(`search:${credentials.scope}`, () => probeSearch(credentials));
    let playback: CapabilityHealth;
    let worker: any;
    if (audioProvider() === "sabr") {
      try {
        worker = await audioHealth(credentials);
        playback = {
          state: worker.state,
          checkedAt: worker.checkedAt,
          expiresAt: worker.expiresAt,
          error: worker.error,
        };
        if (
          credentials.mode !== "user" &&
          (playback.state === "unknown" ||
            (playback.state === "degraded" && worker.lastSuccessAt < Date.now() - 60000))
        ) {
          schedule(`playback:${credentials.scope}`, () => probePlayback(credentials));
        }
      } catch (error) {
        playback = {
          state: "degraded",
          checkedAt: Date.now(),
          expiresAt: Date.now() + 15000,
          error: { code: "AUDIO_SERVICE_UNAVAILABLE", error: (error as Error).message },
        };
      }
    } else {
      playback = await readCapability(credentials.scope, "playback");
    }
    const state =
      search.state === "healthy" && playback.state === "healthy"
        ? "healthy"
        : search.state === "degraded" && playback.state === "degraded"
          ? "offline"
          : search.state === "degraded" || playback.state === "degraded"
            ? "degraded"
            : "unknown";
    return Response.json(
      {
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
        ...(playback.error || search.error ? playback.error || search.error : {}),
        ...(worker?.lastItemError ? { lastItemError: worker.lastItemError } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        state: "degraded",
        online: false,
        searchOk: false,
        extractOk: false,
        code: (error as any).code || "YOUTUBE_UNAVAILABLE",
        error: (error as Error).message,
        expiresAt: Date.now() + 15000,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
