import { NextResponse } from "next/server";
import { upgradeCoverUrl, ytimgViFallbackUrls } from "@/lib/coverUrl";

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

async function fetchCoverBlob(imageUrl: string): Promise<Response | null> {
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": COVER_UA },
    redirect: "manual",
  });

  if (res.status >= 300 && res.status < 400) {
    return null;
  }
  if (!res.ok) return null;
  return res;
}

async function loadCover(
  imageUrl: string,
): Promise<{ blob: Blob; contentType: string } | null> {
  const preferred = upgradeCoverUrl(imageUrl);
  const candidates = Array.from(
    new Set([preferred, ...ytimgViFallbackUrls(preferred), imageUrl]),
  ).filter(isAllowedCoverUrl);

  for (const candidate of candidates) {
    const res = await fetchCoverBlob(candidate);
    if (!res) continue;

    const blob = await res.blob();
    // YouTube sometimes returns a tiny placeholder JPEG for missing maxres.
    if (blob.size > 0 && blob.size < 2000 && /ytimg\.com/i.test(candidate)) {
      continue;
    }

    return {
      blob,
      contentType: res.headers.get("content-type") || "image/jpeg",
    };
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new NextResponse("Missing url", { status: 400 });
  }
  if (!isAllowedCoverUrl(imageUrl)) {
    return new NextResponse("URL not allowed", { status: 400 });
  }

  try {
    const now = Date.now();
    const cached = getCoverCache().get(imageUrl);
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
    let request = requests.get(imageUrl);
    if (!request) {
      request = loadCover(imageUrl);
      requests.set(imageUrl, request);
      void request.then(
        () => requests.delete(imageUrl),
        () => requests.delete(imageUrl),
      );
    }

    const result = await request;
    if (!result) {
      console.error("[Moonlit] cover upstream miss", imageUrl);
      return new NextResponse("Failed to fetch", { status: 404 });
    }

    const coverCache = getCoverCache();
    coverCache.set(imageUrl, { ...result, expiresAt: now + 86_400_000 });
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
    return new NextResponse("Failed to fetch", { status: 502 });
  }
}
