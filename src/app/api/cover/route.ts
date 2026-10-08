import { NextResponse } from "next/server";
import { coverFallbackUrls } from "@/lib/coverUrl";

/** YouTube / Google image CDNs only — blocks open SSRF via ?url=. */
const ALLOWED_COVER_HOST_SUFFIXES = [
  "ytimg.com",
  "ggpht.com",
  "googleusercontent.com",
] as const;

function isAllowedCoverUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return false;
  // Reject raw IPv4 / IPv6 literals (bypass hostname allowlist).
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) return false;

  return ALLOWED_COVER_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

const COVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const coverRuntime = globalThis as typeof globalThis & {
  __moonlitCoverCache?: Map<
    string,
    { blob: Blob; contentType: string; expiresAt: number }
  >;
  __moonlitCoverRequests?: Map<
    string,
    Promise<{ blob: Blob; contentType: string } | null>
  >;
};

function getCoverCache() {
  return (coverRuntime.__moonlitCoverCache ??= new Map());
}

function getCoverRequests() {
  return (coverRuntime.__moonlitCoverRequests ??= new Map());
}

async function fetchCoverBlob(
  imageUrl: string,
  signal: AbortSignal,
): Promise<Response | null> {
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": COVER_UA },
    redirect: "manual",
    signal,
  });

  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  if (
    !/^image\/(jpeg|png|webp|avif|gif)(?:;|$)/i.test(
      res.headers.get("content-type") || "",
    )
  ) {
    await res.body?.cancel();
    return null;
  }
  return res;
}

async function loadCover(
  imageUrl: string,
  videoId?: string | null,
): Promise<{ blob: Blob; contentType: string } | null> {
  const candidates = coverFallbackUrls(imageUrl, videoId).filter(isAllowedCoverUrl);
  const deadline = AbortSignal.timeout(12000);

  for (const candidate of candidates) {
    if (deadline.aborted) break;
    try {
      const res = await fetchCoverBlob(
        candidate,
        AbortSignal.any([deadline, AbortSignal.timeout(3500)]),
      );
      if (!res) continue;

      const blob = await res.blob();
      if (!blob.size) continue;
      // YouTube sometimes returns a tiny placeholder JPEG for missing maxres.
      if (blob.size < 2000 && /ytimg\.com/i.test(candidate)) continue;
      const contentType = await imageContentType(blob);
      if (!contentType) continue;

      return {
        blob,
        contentType,
      };
    } catch {
      // A failed or timed-out CDN candidate must not prevent lower-resolution recovery.
    }
  }

  return null;
}

/** An image MIME header alone is not enough to cache an upstream response. */
async function imageContentType(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const ascii = new TextDecoder().decode(bytes);
  if (
    bytes[0] === 0x89 &&
    ascii.slice(1, 4) === "PNG" &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  )
    return "image/png";
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.slice(4, 8) === "ftyp" && /avif|avis/.test(ascii.slice(8)))
    return "image/avif";
  return null;
}

function coverError(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");
  const videoId = searchParams.get("v");

  if (!imageUrl) {
    return coverError("Missing url", 400);
  }
  if (!isAllowedCoverUrl(imageUrl)) {
    return coverError("URL not allowed", 400);
  }
  if (videoId && !/^[\w-]{11}$/.test(videoId)) return coverError("Invalid video id", 400);

  try {
    const now = Date.now();
    const cacheKey = `${imageUrl}\n${videoId || ""}`;
    const cached = getCoverCache().get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return new NextResponse(cached.blob, {
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const requests = getCoverRequests();
    let request = requests.get(cacheKey);
    if (!request) {
      request = loadCover(imageUrl, videoId);
      requests.set(cacheKey, request);
      void request.then(
        () => requests.delete(cacheKey),
        () => requests.delete(cacheKey),
      );
    }

    const result = await request;
    if (!result) {
      console.error("[Moonlit] cover upstream miss", imageUrl);
      return coverError("Failed to fetch", 404);
    }

    const coverCache = getCoverCache();
    coverCache.set(cacheKey, { ...result, expiresAt: now + 86_400_000 });
    while (coverCache.size > 128) {
      const oldest = coverCache.keys().next().value;
      if (oldest === undefined) break;
      coverCache.delete(oldest);
    }
    return new NextResponse(result.blob, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("[Moonlit] cover fetch error:", e);
    return coverError("Failed to fetch", 502);
  }
}
