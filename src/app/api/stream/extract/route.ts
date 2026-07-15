import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  type StreamToken,
  TOKEN_TTL_MS,
  getTokenStore,
  pruneExpired,
} from "@/lib/streamTokens";
import { extractStreamUrl } from "@/lib/youtubei";

export async function POST(req: Request) {
  try {
    const { url, cookies } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const streamInfo = await extractStreamUrl(url, { cookies, signal: req.signal });

    pruneExpired();

    const token = crypto.randomUUID();
    const store = getTokenStore();
    store.set(token, {
      url: streamInfo.url,
      contentType: streamInfo.contentType,
      headers: streamInfo.headers,
      sourceUrl: streamInfo.sourceUrl,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });

    return NextResponse.json({
      token,
      url: streamInfo.url,
      metadata: {
        title: streamInfo.title,
        author: streamInfo.author,
        artist: streamInfo.artist,
        album: streamInfo.album,
        coverUrl: streamInfo.thumbnail
          ? `/api/cover?url=${encodeURIComponent(streamInfo.thumbnail)}`
          : "",
      },
      duration: streamInfo.duration,
      contentType: streamInfo.contentType,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Request cancelled" }, { status: 499 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Moonlit] Stream extract error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
