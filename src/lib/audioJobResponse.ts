import type { AudioJob } from "@/lib/audioWorker";
import { upgradeCoverUrl } from "@/lib/coverUrl";
import { TOKEN_TTL_MS, createStreamToken, pruneExpired } from "@/lib/streamTokens";

export function audioJobResponse(job: AudioJob): Response {
  if (job.state === "failed" || job.state === "cancelled") {
    return Response.json(job.error || { error: "Media preparation failed." }, {
      status: job.error?.status || 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (job.state !== "ready" || !job.asset)
    return Response.json(job, { status: 202, headers: { "Cache-Control": "no-store" } });
  const asset = job.asset;
  pruneExpired();
  const token = createStreamToken({
    assetId: asset.id,
    contentType: asset.contentType,
    headers: {},
    sourceUrl: `https://www.youtube.com/watch?v=${job.videoId}`,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });
  return Response.json(
    {
      token,
      duration: asset.duration,
      contentType: asset.contentType,
      cached: job.cached,
      isAudioTrackVideo: Boolean(asset.metadata.isAudioTrackVideo),
      metadata: {
        title: asset.metadata.title,
        author: asset.metadata.author,
        artist: asset.metadata.artist,
        coverUrl: asset.metadata.thumbnail
          ? `/api/cover?url=${encodeURIComponent(upgradeCoverUrl(asset.metadata.thumbnail))}`
          : "",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
