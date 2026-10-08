import { NextResponse } from "next/server";
import { youtubeErrorCode } from "@/lib/apiError";
import { audioJobResponse } from "@/lib/audioJobResponse";
import { audioProvider, createAudioJob } from "@/lib/audioWorker";
import { readRequestCookiesResult, sanitizeUserCookies } from "@/lib/cookies";
import { upgradeCoverUrl } from "@/lib/coverUrl";
import {
  enforceYouTubeExtractLimit,
  handleYoutubeGuardError,
} from "@/lib/rateLimitYouTube";
import { TOKEN_TTL_MS, createStreamToken, pruneExpired } from "@/lib/streamTokens";
import { withYoutubeCircuit } from "@/lib/youtubeCircuit";
import { resolveYoutubeCredentials } from "@/lib/youtubeCredentials";
import { recordCapability } from "@/lib/youtubeHealth";
import { extractStreamUrl } from "@/lib/youtubei";
import { getYouTubeId } from "@/utils";

export async function POST(req: Request) {
  const limited = enforceYouTubeExtractLimit(req);
  if (limited) return limited;

  try {
    const body = await req.json();
    const { url } = body;
    const supplied = readRequestCookiesResult(req);
    if (supplied.status === "invalid")
      return NextResponse.json(
        { error: supplied.error, code: "INVALID_COOKIES" },
        { status: 400 },
      );
    const cookies =
      supplied.status === "ok" ? supplied.cookies : sanitizeUserCookies(body.cookies);
    if (body.cookies && !cookies)
      return NextResponse.json(
        { error: "Invalid YouTube cookies.", code: "INVALID_COOKIES" },
        { status: 400 },
      );

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const videoId = getYouTubeId(url);
    if (!videoId)
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    const credentials = await resolveYoutubeCredentials(cookies);
    if (audioProvider() === "sabr")
      return audioJobResponse(await createAudioJob(videoId, credentials, req.signal));

    let streamInfo;
    try {
      streamInfo = await withYoutubeCircuit(
        () => extractStreamUrl(url, { cookies, signal: req.signal }),
        `playback:${credentials.scope}`,
      );
    } catch (error) {
      if (!req.signal.aborted)
        await recordCapability(credentials.scope, "playback", error).catch(() => {});
      throw error;
    }

    pruneExpired();

    const expiresAt = Date.now() + TOKEN_TTL_MS;

    const token = createStreamToken({
      url: streamInfo.url,
      contentType: streamInfo.contentType,
      headers: streamInfo.headers,
      sourceUrl: streamInfo.sourceUrl,
      healthScope: credentials.scope,
      expiresAt,
    });

    // Video is shown via YouTube embed on the client — no video proxy token.
    return NextResponse.json({
      token,
      metadata: {
        title: streamInfo.title,
        author: streamInfo.author,
        artist: streamInfo.artist,
        album: streamInfo.album,
        coverUrl: streamInfo.thumbnail
          ? `/api/cover?url=${encodeURIComponent(upgradeCoverUrl(streamInfo.thumbnail))}`
          : "",
      },
      duration: streamInfo.duration,
      contentType: streamInfo.contentType,
      isAudioTrackVideo: streamInfo.isAudioTrackVideo ?? false,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Request cancelled" }, { status: 499 });
    }

    const circuit = handleYoutubeGuardError(error);
    if (circuit) return circuit;

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Moonlit] Stream extract error:", message);
    const code = (error as { code?: string })?.code || youtubeErrorCode(message);
    return NextResponse.json(
      { error: message, ...(code ? { code } : {}) },
      { status: (error as { status?: number })?.status || 502 },
    );
  }
}
