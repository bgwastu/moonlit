import { AudioError, checkPlayability } from "./errors.mjs";

/** Read a JSON object embedded in a script without evaluating page JavaScript. */
export function embeddedObject(html, markers) {
  for (const marker of markers) {
    const position = html.indexOf(marker);
    if (position < 0) continue;
    const start = html.indexOf("{", position + marker.length);
    if (start < 0) continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < html.length; end++) {
      const char = html[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try {
          return JSON.parse(html.slice(start, end + 1));
        } catch {
          break;
        }
      }
    }
  }
  throw new AudioError(
    "YOUTUBE_CLIENT_ERROR",
    "YouTube's watch page did not provide playback data.",
    { retryable: true },
  );
}

export async function watchPlayer(fetchImpl, videoId, userAgent, signal) {
  const response = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": userAgent, "Accept-Language": "en-US,en;q=0.9" },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  let html = "";
  const decoder = new TextDecoder();
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 10 * 1024 * 1024)
        throw new AudioError(
          "YOUTUBE_CLIENT_ERROR",
          "YouTube returned an oversized watch page.",
        );
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  const raw = embeddedObject(html, [
    "var ytInitialPlayerResponse =",
    "ytInitialPlayerResponse=",
    'window["ytInitialPlayerResponse"] =',
  ]);
  checkPlayability(raw, videoId);
  const script = html.match(/"PLAYER_JS_URL"\s*:\s*("(?:[^"\\]|\\.)*")/);
  const playerId = script
    ? JSON.parse(script[1]).match(/\/s\/player\/([^/]+)\//)?.[1]
    : undefined;
  return { raw, playerId };
}
