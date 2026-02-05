import { NextResponse } from "next/server";
import { isAllowedMediaProxyUrl } from "@/lib/mediaProxy";

const UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_MEDIA_TYPE = "application/octet-stream";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!isAllowedMediaProxyUrl(targetUrl)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  const range = request.headers.get("range");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    const upstreamRes = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Moonlit/1.0; +https://github.com/moonlit)",
        ...(range && { Range: range }),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return NextResponse.json(
        { error: `Upstream returned ${upstreamRes.status}` },
        { status: upstreamRes.status === 404 ? 404 : 502 },
      );
    }

    const contentType = upstreamRes.headers.get("content-type") || DEFAULT_MEDIA_TYPE;
    const contentLength = upstreamRes.headers.get("content-length");
    const acceptRanges = upstreamRes.headers.get("accept-ranges");
    const contentRange = upstreamRes.headers.get("content-range");

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    };
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;
    if (contentRange) responseHeaders["Content-Range"] = contentRange;

    return new Response(upstreamRes.body as any, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json({ error: "Upstream request timeout" }, { status: 504 });
    }
    console.error("[Moonlit] media-proxy fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 502 });
  }
}
