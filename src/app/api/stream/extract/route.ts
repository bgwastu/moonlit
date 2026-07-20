import { NextResponse } from "next/server";
import crypto from "crypto";
import { youtubeErrorCode } from "@/lib/apiError";
import { readRequestCookies, sanitizeUserCookies } from "@/lib/cookies";
import { upgradeCoverUrl } from "@/lib/coverUrl";
import {
  enforceYouTubeExtractLimit,
  handleYoutubeGuardError,
} from "@/lib/rateLimitYouTube";
import { TOKEN_TTL_MS, getTokenStore, pruneExpired } from "@/lib/streamTokens";
import { withYoutubeCircuit } from "@/lib/youtubeCircuit";
import { extractStreamUrl } from "@/lib/youtubei";

export async function POST(req: Request) {
  const limited = enforceYouTubeExtractLimit(req);
  if (limited) return limited;

  try {
    const body = await req.json();
    const { url } = body;
    const cookies = readRequestCookies(req) ?? sanitizeUserCookies(body.cookies);

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const streamInfo = await withYoutubeCircuit(() =>
      extractStreamUrl(url, { cookies, signal: req.signal }),
    );

    pruneExpired();

    const store = getTokenStore();
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    const token = crypto.randomUUID();
    store.set(token, {
      url: streamInfo.url,
      contentType: streamInfo.contentType,
      headers: streamInfo.headers,
      sourceUrl: streamInfo.sourceUrl,
      expiresAt,
    });

    // Video is shown via YouTube embed on the client — no video proxy token.
    return NextResponse.json({
      token,
      url: streamInfo.url,
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
    const code = youtubeErrorCode(message);
    return NextResponse.json(
      { error: message, ...(code ? { code } : {}) },
      { status: 500 },
    );
  }
}
