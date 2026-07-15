import { NextResponse } from "next/server";
import { proxyStreamRange, streamCorsHeaders } from "@/lib/streamProxy";
import { getTokenStore } from "@/lib/streamTokens";

function textResponse(message: string, status: number) {
  return new Response(message, { status, headers: streamCorsHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: streamCorsHeaders() });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !/^[a-f0-9-]+$/i.test(token)) {
    return textResponse("Invalid token", 400);
  }

  const store = getTokenStore();
  const entry = store.get(token);

  if (!entry) {
    return textResponse("Token not found or expired", 404);
  }

  if (Date.now() > entry.expiresAt) {
    store.delete(token);
    return textResponse("Token expired", 410);
  }

  const result = await proxyStreamRange(entry, req.headers.get("range"));
  if (result instanceof Response) return result;

  if (result.json) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status, headers: streamCorsHeaders() },
    );
  }

  return textResponse(result.message, result.status);
}
