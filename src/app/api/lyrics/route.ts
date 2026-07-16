import { NextResponse } from "next/server";

const BETTER_LYRICS_BASE = "https://lyrics-api.boidu.dev/getLyrics";

interface BetterLyricsResponse {
  ttml?: string;
  error?: string;
}

/**
 * Proxy Better Lyrics for CORS. Cache hits need no API key; misses return
 * ttml: null so the client can fall through to LRCLib.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const song = searchParams.get("s")?.trim();
  const artist = searchParams.get("a")?.trim();
  const duration = searchParams.get("d")?.trim();

  if (!song || !artist) {
    return NextResponse.json(
      { error: "Missing s (song) or a (artist)" },
      { status: 400 },
    );
  }

  const upstream = new URL(BETTER_LYRICS_BASE);
  upstream.searchParams.set("s", song);
  upstream.searchParams.set("a", artist);
  if (duration) upstream.searchParams.set("d", duration);

  try {
    const res = await fetch(upstream.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Moonlit (https://github.com/bgwastu/moonlit)",
      },
      // Avoid Next fetch caching of 401s as permanent misses across users
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 404 || res.status === 429) {
      return NextResponse.json({ source: "betterlyrics", ttml: null }, { status: 200 });
    }

    if (!res.ok) {
      console.error("[Moonlit] better-lyrics upstream", res.status);
      return NextResponse.json({ source: "betterlyrics", ttml: null }, { status: 200 });
    }

    const data = (await res.json()) as BetterLyricsResponse;
    const ttml = typeof data.ttml === "string" && data.ttml.trim() ? data.ttml : null;

    return NextResponse.json(
      { source: "betterlyrics", ttml },
      {
        status: 200,
        headers: ttml
          ? { "Cache-Control": "private, max-age=3600" }
          : { "Cache-Control": "private, max-age=60" },
      },
    );
  } catch (e) {
    console.error("[Moonlit] better-lyrics fetch error:", e);
    return NextResponse.json({ source: "betterlyrics", ttml: null }, { status: 200 });
  }
}
