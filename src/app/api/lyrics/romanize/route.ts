import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import {
  MAX_ROMANIZATION_LINES,
  MAX_ROMANIZATION_LINE_LENGTH,
  MAX_ROMANIZATION_TEXT_LENGTH,
} from "@/lib/romanization";
import { romanizeLyrics } from "@/lib/romanization.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = checkRateLimit(`romanization:${getClientIp(request)}`, 30, 60000);
  if (limit.ok === false) return rateLimitResponse(limit.retryAfterSec);

  try {
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    let bytes = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 128000) {
          await reader.cancel();
          return NextResponse.json(
            { error: "Lyrics request is too large" },
            { status: 413 },
          );
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    }
    const body = JSON.parse(raw);
    const lines = body?.lines;
    if (
      !Array.isArray(lines) ||
      lines.length === 0 ||
      lines.some((line) => typeof line !== "string")
    ) {
      return NextResponse.json(
        { error: "Expected an array of lyric lines" },
        { status: 400 },
      );
    }
    if (
      lines.length > MAX_ROMANIZATION_LINES ||
      lines.some((line) => line.length > MAX_ROMANIZATION_LINE_LENGTH) ||
      lines.reduce((length, line) => length + line.length, 0) >
        MAX_ROMANIZATION_TEXT_LENGTH
    ) {
      return NextResponse.json({ error: "Lyrics request is too large" }, { status: 413 });
    }
    const romanizations = await romanizeLyrics(lines);
    return NextResponse.json(
      { romanizations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    console.error("[Moonlit] romanization conversion error:", error);
    return NextResponse.json({ error: "Couldn't load romanization" }, { status: 503 });
  }
}
