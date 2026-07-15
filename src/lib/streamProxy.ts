import { STREAM_CHUNK_BYTES } from "@/lib/streamConstants";
import type { StreamToken } from "@/lib/streamTokens";
import { YOUTUBE_ANDROID_VR_UA } from "@/lib/youtubei";

const UPSTREAM_TIMEOUT_MS = 30_000;

export function streamCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  };
}

type ByteRange = { start: number; end: number };

function parseRangeHeader(header: string | null): ByteRange | null {
  const match = header?.trim().match(/^bytes=(\d+)-(\d*)$/i);
  if (!match) return null;

  const start = Number(match[1]);
  const end = match[2] === "" ? start + STREAM_CHUNK_BYTES - 1 : Number(match[2]);
  return { start, end };
}

export function boundByteRange(rangeHeader: string | null, fileSize?: number): ByteRange {
  const parsed = parseRangeHeader(rangeHeader);
  let start = parsed?.start ?? 0;
  let end = parsed?.end ?? start + STREAM_CHUNK_BYTES - 1;

  end = Math.min(end, start + STREAM_CHUNK_BYTES - 1);
  if (fileSize != null && fileSize > 0) end = Math.min(end, fileSize - 1);
  end = Math.max(end, start);

  return { start, end };
}

function fileSizeFromUrl(url: string): number | undefined {
  try {
    const n = Number(new URL(url).searchParams.get("clen"));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function contentRangeHeader(
  start: number,
  end: number,
  fileSize: number | undefined,
  upstream: string | null,
): string {
  if (upstream && fileSize != null) {
    const match = upstream.match(/^bytes (\d+)-(\d+)\//i);
    if (match) return `bytes ${match[1]}-${match[2]}/${fileSize}`;
  }
  return `bytes ${start}-${end}/${fileSize ?? "*"}`;
}

export type StreamProxyError = {
  status: number;
  message: string;
  json?: boolean;
};

export async function proxyStreamRange(
  entry: StreamToken,
  rangeHeader: string | null,
): Promise<Response | StreamProxyError> {
  const fileSize = fileSizeFromUrl(entry.url);
  const { start, end } = boundByteRange(rangeHeader, fileSize);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(entry.url, {
      headers: {
        ...entry.headers,
        "User-Agent": entry.headers["User-Agent"] || YOUTUBE_ANDROID_VR_UA,
        Range: `bytes=${start}-${end}`,
      },
      signal: controller.signal,
    });

    if (upstream.status !== 200 && upstream.status !== 206) {
      console.error(
        `[Moonlit] stream-proxy upstream ${upstream.status} for ${start}-${end}`,
      );
      return { status: 502, message: "Failed to fetch stream" };
    }

    const headers: Record<string, string> = {
      ...streamCorsHeaders(),
      "Content-Type": upstream.headers.get("content-type") || entry.contentType,
      "Cache-Control": "private, no-store",
      "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
      "Content-Range": contentRangeHeader(
        start,
        end,
        fileSize,
        upstream.headers.get("content-range"),
      ),
    };

    const length = upstream.headers.get("content-length");
    if (length) headers["Content-Length"] = length;

    return new Response(upstream.body, { status: 206, headers });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { status: 504, message: "Upstream request timeout", json: true };
    }
    console.error("[Moonlit] stream-proxy error:", e);
    return { status: 502, message: "Failed to fetch stream", json: true };
  } finally {
    clearTimeout(timeout);
  }
}
