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

export function searchErrorCode(message: string): string | undefined {
  const lower = message.toLowerCase();
  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("unavailable") ||
    lower.includes("socket")
  ) {
    return "SEARCH_UNAVAILABLE";
  }
  return undefined;
}
