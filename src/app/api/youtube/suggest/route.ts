import { searchErrorCode } from "@/lib/apiError";
import { readRequestCookies } from "@/lib/cookies";
import { getSearchSuggestions } from "@/lib/youtubei";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? 10);

  if (!query) {
    return Response.json({ suggestions: [] });
  }

  try {
    const suggestions = await getSearchSuggestions(query, {
      limit: Math.min(Math.max(limit || 10, 1), 20),
      cookies: readRequestCookies(request),
    });
    return Response.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load suggestions.";
    console.error("[Moonlit] YouTube suggest error:", message);
    const code = searchErrorCode(message);
    return Response.json(
      { error: message, suggestions: [], ...(code ? { code } : {}) },
      { status: 500 },
    );
  }
}
