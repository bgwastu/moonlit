import { apiError } from "@/lib/apiError";
import { workerRequest } from "@/lib/audioWorker";
import { getStreamToken } from "@/lib/streamTokens";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const entry = getStreamToken(token);
  if (!entry) return apiError("Token not found or expired", 404, cors);
  try {
    const range = request.headers.get("range");
    const response = await workerRequest("/v1/assets/" + entry.assetId, {
      headers: range ? { Range: range } : {},
      signal: request.signal,
      media: true,
    });
    const headers = new Headers(cors);
    for (const key of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
    ]) {
      const value = response.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new Response(response.body as ReadableStream, {
      status: response.status,
      headers,
    });
  } catch (error) {
    const failure = error as Error & { status?: number; code?: string };
    return apiError(failure.message, failure.status || 503, cors, failure.code);
  }
}
