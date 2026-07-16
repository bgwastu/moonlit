export type ApiErrorBody = {
  error: string;
  code?: string;
};

export function apiError(
  message: string,
  status: number,
  extraHeaders?: Record<string, string>,
  code?: string,
): Response {
  const body: ApiErrorBody = { error: message };
  if (code) body.code = code;
  return Response.json(body, { status, headers: extraHeaders });
}

export async function parseApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body?.error) return body.error;
  } catch {
    // Response body was not JSON.
  }
  const fallback = `${res.status} ${res.statusText}`.trim();
  return fallback || "Request failed";
}

export async function parseApiErrorBody(res: Response): Promise<ApiErrorBody> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body?.error) return body;
  } catch {
    // Response body was not JSON.
  }
  return {
    error: `${res.status} ${res.statusText}`.trim() || "Request failed",
    ...(res.status === 429 ? { code: "RATE_LIMITED" } : {}),
  };
}

function isNetworkMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("unavailable") ||
    lower.includes("socket")
  );
}

function isBotBlockMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("not a bot") || lower.includes("sign in to confirm");
}

export function youtubeErrorCode(
  message: string,
  httpStatus?: number,
): string | undefined {
  if (httpStatus === 429) return "RATE_LIMITED";
  if (isNetworkMessage(message)) return "YOUTUBE_UNAVAILABLE";
  if (isBotBlockMessage(message)) return "YOUTUBE_BLOCKED";
  if (message.toLowerCase().includes("no streaming data")) return "STREAM_UNAVAILABLE";
  return undefined;
}

/** @deprecated Use youtubeErrorCode */
export function searchErrorCode(message: string): string | undefined {
  return youtubeErrorCode(message);
}

export function youtubeErrorTitle(code?: string): string {
  switch (code) {
    case "RATE_LIMITED":
      return "Too many requests";
    case "YOUTUBE_UNAVAILABLE":
      return "YouTube unavailable";
    case "YOUTUBE_BLOCKED":
      return "YouTube blocked request";
    case "STREAM_UNAVAILABLE":
      return "Stream unavailable";
    default:
      return "Request failed";
  }
}
