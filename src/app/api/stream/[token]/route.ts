import { NextResponse } from "next/server";
import http from "http";
import https from "https";
import { getTokenStore } from "@/lib/streamTokens";

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

function upstreamFetch(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: NodeJS.ReadableStream;
}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const abort = () => req.destroy();

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    }

    const req = mod.get(url, { headers }, (res) => {
      const status = res.statusCode || 502;
      const respHeaders: Record<string, string> = {};
      for (let i = 0; i < res.rawHeaders.length; i += 2) {
        respHeaders[res.rawHeaders[i].toLowerCase()] = res.rawHeaders[i + 1];
      }
      resolve({ status, headers: respHeaders, body: res });
    });

    req.on("error", (e) => {
      signal?.removeEventListener("abort", abort);
      reject(e);
    });

    req.setTimeout(25_000, () => {
      req.destroy();
      reject(new Error("Upstream timeout"));
    });
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

    const upstream = await upstreamFetch(entry.url, upstreamHeaders, controller.signal);
    clearTimeout(timeoutId);

    if (upstream.status !== 200 && upstream.status !== 206) {
      store.delete(token);
      return new Response("Stream URL expired", {
        status: 410,
        headers: corsHeaders(),
      });
    }

    const contentLength = upstream.headers["content-length"];
    const acceptRanges = upstream.headers["accept-ranges"];
    const contentRange = upstream.headers["content-range"];
    const upstreamContentType = upstream.headers["content-type"];

    const responseHeaders: Record<string, string> = {
      ...corsHeaders(),
      "Content-Type": upstreamContentType || entry.contentType,
      "Cache-Control": "public, max-age=21600",
    };
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;
    else responseHeaders["Accept-Ranges"] = "bytes";
    if (contentRange) responseHeaders["Content-Range"] = contentRange;

    return new Response(upstream.body as any, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json(
        { error: "Upstream request timeout" },
        { status: 504, headers: corsHeaders() },
      );
    }
    console.error("[Moonlit] stream-proxy error:", e);
    return NextResponse.json(
      { error: "Failed to fetch stream" },
      { status: 502, headers: corsHeaders() },
    );
  }
}
