import { NextResponse } from "next/server";

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
    // Manual redirects so Location cannot pivot off the allowlist.
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      return new NextResponse("Redirect not allowed", { status: 400 });
    }

    if (!res.ok) {
      console.error("[Moonlit] cover upstream", res.status, imageUrl);
      return new NextResponse("Failed to fetch", { status: res.status });
    }

    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("[Moonlit] cover fetch error:", e);
    return new NextResponse("Failed to fetch", { status: 502 });
  }
}
