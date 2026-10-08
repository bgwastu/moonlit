import { parseApiErrorBody } from "@/lib/apiError";
import { cookieRequestHeaders, getCookiesToUse } from "@/lib/cookies";

export class StreamError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "StreamError";
    this.code = code;
  }
}

export type PreparedMedia = {
  token: string;
  contentType?: string;
  duration?: number;
  cached?: boolean;
  isAudioTrackVideo?: boolean;
  metadata?: {
    title?: string;
    author?: string;
    artist?: string;
    album?: string;
    coverUrl?: string;
  };
};

/** Poll a leased worker job, releasing only this caller's lease on cancellation. */
export async function prepareMedia(
  url: string,
  kind: "audio" | "video",
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<PreparedMedia> {
  signal?.throwIfAborted();
  const { cookies } = getCookiesToUse();
  let response = await fetch(
    kind === "audio" ? "/api/stream/extract" : "/api/video/extract",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieRequestHeaders() },
      body: JSON.stringify({ url, cookies }),
      signal,
      cache: "no-store",
    },
  );
  let job:
    | { jobId: string; leaseId?: string; state: string; percent?: number }
    | undefined;
  let cancelled = false;
  const cancel = () => {
    if (!job?.leaseId || cancelled) return;
    cancelled = true;
    void fetch(`/api/stream/jobs/${job.jobId}?lease=${job.leaseId}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const deadline = Date.now() + 200000;
    while (response.status === 202) {
      const next = await response.json();
      job = { ...next, leaseId: next.leaseId || job?.leaseId };
      if (!/^[a-f0-9]{32}$/.test(job.jobId) || !/^[a-f0-9]{32}$/.test(job.leaseId || ""))
        throw new StreamError("The playback service returned an invalid job.");
      signal?.throwIfAborted();
      if (Date.now() > deadline)
        throw new StreamError(
          `${kind === "video" ? "Video" : "Audio"} preparation took too long. Please try again.`,
          `${kind.toUpperCase()}_TIMEOUT`,
        );
      onProgress?.(
        job.state === "downloading"
          ? `Downloading ${kind}${job.percent ? ` (${job.percent}%)` : ""}…`
          : job.state === "validating"
            ? `Checking ${kind}…`
            : `Preparing ${kind}…`,
      );
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(done, kind === "video" ? 1000 : 500);
        function done() {
          signal?.removeEventListener("abort", stopped);
          resolve();
        }
        function stopped() {
          window.clearTimeout(timer);
          signal?.removeEventListener("abort", stopped);
          reject(signal.reason);
        }
        signal?.addEventListener("abort", stopped, { once: true });
      });
      response = await fetch(`/api/stream/jobs/${job.jobId}?lease=${job.leaseId}`, {
        signal,
        cache: "no-store",
      });
    }
    if (!response.ok) {
      const body = await parseApiErrorBody(response);
      throw new StreamError(
        body.error || `Preparation failed (${response.status})`,
        body.code,
      );
    }
    const result = (await response.json()) as PreparedMedia;
    signal?.throwIfAborted();
    if (!result.token || typeof result.token !== "string")
      throw new StreamError("The playback service returned no media.");
    return result;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
