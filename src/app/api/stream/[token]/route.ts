import { NextResponse } from "next/server";

interface StreamToken {
  url: string;
  contentType: string;
  headers: Record<string, string>;
  sourceUrl: string;
  expiresAt: number;
}

const tokenStore = globalThis as typeof globalThis & {
  __moonlitStreamTokens?: Map<string, StreamToken>;
};

function getTokenStore(): Map<string, StreamToken> {
  if (!tokenStore.__moonlitStreamTokens) {
    tokenStore.__moonlitStreamTokens = new Map();
  }
  return tokenStore.__moonlitStreamTokens;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  };
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !/^[a-f0-9-]+$/i.test(token)) {
    return new Response("Invalid token", { status: 400, headers: corsHeaders() });
  }

  const store = getTokenStore();
  const entry = store.get(token);

  if (!entry) {
    return new Response("Token not found or expired", {
      status: 404,
      headers: corsHeaders(),
    });
  }

  if (Date.now() > entry.expiresAt) {
    store.delete(token);
    return new Response("Token expired", { status: 410, headers: corsHeaders() });
  }

  const range = req.headers.get("range");
  const upstreamHeaders: Record<string, string> = {
    ...entry.headers,
  };
  if (range) {
    upstreamHeaders["Range"] = range;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const upstreamRes = await fetch(entry.url, {
      headers: upstreamHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      if (upstreamRes.status === 403 || upstreamRes.status === 410) {
        store.delete(token);
        return new Response("Stream URL expired", {
          status: 410,
          headers: corsHeaders(),
        });
      }
      return NextResponse.json(
        { error: `Upstream returned ${upstreamRes.status}` },
        { status: upstreamRes.status === 404 ? 404 : 502, headers: corsHeaders() },
      );
    }

    const contentLength = upstreamRes.headers.get("content-length");
    const acceptRanges = upstreamRes.headers.get("accept-ranges");
    const contentRange = upstreamRes.headers.get("content-range");
    const upstreamContentType = upstreamRes.headers.get("content-type");

    const responseHeaders: Record<string, string> = {
      ...corsHeaders(),
      "Content-Type": upstreamContentType || entry.contentType,
      "Cache-Control": "no-cache",
    };
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;
    else responseHeaders["Accept-Ranges"] = "bytes";
    if (contentRange) responseHeaders["Content-Range"] = contentRange;

    return new Response(upstreamRes.body as any, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json(
        { error: "Upstream request timeout" },
        { status: 504, headers: corsHeaders() },
      );
    }
    console.error("[Moonlit] stream-proxy fetch error:", e);
    return NextResponse.json(
      { error: "Failed to fetch stream" },
      { status: 502, headers: corsHeaders() },
    );
  }
}
