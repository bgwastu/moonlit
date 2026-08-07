import { apiError } from "@/lib/apiError";
import { proxyStreamRange, streamCorsHeaders } from "@/lib/streamProxy";
import { getStreamToken } from "@/lib/streamTokens";

const cors = streamCorsHeaders;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    return apiError("Invalid token", 400, cors());
  }

  const entry = getStreamToken(token);

  if (!entry) {
    return apiError("Token not found or expired", 404, cors());
  }

  if (Date.now() > entry.expiresAt) {
    return apiError("Token expired", 410, cors());
  }

  const result = await proxyStreamRange(entry, req.headers.get("range"));
  if (result instanceof Response) return result;

  return apiError(result.message, result.status, cors());
}
