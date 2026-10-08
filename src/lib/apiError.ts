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
    case "YOUTUBE_CLIENT_ERROR":
      return "Playback request rejected";
    case "CONTENT_UNAVAILABLE":
    case "YOUTUBE_ACCESS_DENIED":
      return "Track unavailable";
    case "AUTH_REQUIRED":
      return "Account required";
    case "INVALID_COOKIES":
      return "Account cookies invalid";
    case "AUDIO_SERVICE_UNAVAILABLE":
    case "AUDIO_TIMEOUT":
    case "AUDIO_INCOMPLETE":
      return "Audio preparation failed";
    default:
      return "Request failed";
  }
}
