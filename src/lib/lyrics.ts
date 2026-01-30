/**
 * Lyric types and LRC parser compatible with better-lyrics style display.
 * LRC format: [mm:ss.xx] or [mm:ss] line text, optionally enhanced: <mm:ss.xx>word</mm:ss.xx> or just <mm:ss.xx>word
 */

export interface LyricPart {
  startTimeMs: number;
  words: string;
  durationMs: number;
}

export interface Lyric {
  startTimeMs: number;
  words: string; // Full line text
  durationMs: number;
  parts?: LyricPart[]; // Word-level timing if available
}

/** LRCLib search API result item */
export interface LyricsSearchRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/**
 * Parse LRC time string to milliseconds.
 * Supports: ss.xx, mm:ss.xx, hh:mm:ss.xx
 */
function parseLrcTime(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  if (parts.length === 1) {
    const [s, cs] = parts[0].split(".");
    const sec = parseInt(s || "0", 10);
    const centisec = parseInt((cs || "0").padEnd(2, "0").slice(0, 2), 10);
    return sec * 1000 + centisec * 10;
  }
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10);
    const [s, cs] = parts[1].split(".");
    const sec = parseInt(s || "0", 10);
    const centisec = parseInt((cs || "0").padEnd(2, "0").slice(0, 2), 10);
    return min * 60000 + sec * 1000 + centisec * 10;
  }
  if (parts.length >= 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const [s, cs] = parts[2].split(".");
    const sec = parseInt(s || "0", 10);
    const centisec = parseInt((cs || "0").padEnd(2, "0").slice(0, 2), 10);
    return h * 3600000 + m * 60000 + sec * 1000 + centisec * 10;
  }
  return 0;
}

const LRC_LINE_TIME_TAG = /\[(\d+:\d+(?:\.\d+)?)\]/g;
const LRC_ID_TAG = /^\[(\w+):(.*)\]$/;
// Regex for word-level tags: <mm:ss.xx>word or <mm:ss.xx>
const WORD_TAG_REGEX = /<(\d+:\d+(?:\.\d+)?)>([^<]*)/g;

/**
 * Parse LRC (synced lyrics) text into Lyric[].
 * Handles [mm:ss.xx] and [mm:ss] tags; multiple tags per line create multiple lines.
 * durationMs for each line is inferred from the next line's startTimeMs.
 */
export function parseLRC(lrcText: string, songDurationMs: number): Lyric[] {
  if (!lrcText || !lrcText.trim()) return [];

  const lines = lrcText.split(/\r?\n/);
  const rawEntries: { startTimeMs: number; words: string }[] = [];
  let offsetMs = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const idMatch = trimmed.match(LRC_ID_TAG);
    if (idMatch) {
      const [, key, value] = idMatch;
      if (key === "offset" && value) {
        const num = parseFloat(value);
        if (!Number.isNaN(num)) offsetMs = num;
      }
      continue;
    }

    const times: number[] = [];
    let match: RegExpExecArray | null;
    LRC_LINE_TIME_TAG.lastIndex = 0;
    while ((match = LRC_LINE_TIME_TAG.exec(trimmed)) !== null) {
      times.push(parseLrcTime(match[1]));
    }
    if (times.length === 0) continue;

    const content = trimmed.replace(LRC_LINE_TIME_TAG, "").trim();
    for (const t of times) {
      rawEntries.push({ startTimeMs: t + offsetMs, words: content });
    }
  }

  rawEntries.sort((a, b) => a.startTimeMs - b.startTimeMs);

  const result: Lyric[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const current = rawEntries[i];
    const next = rawEntries[i + 1];
    const lineDurationMs =
      next != null
        ? Math.max(0, next.startTimeMs - current.startTimeMs)
        : Math.max(0, songDurationMs - current.startTimeMs);

    const parts: LyricPart[] = [];
    let wordMatch: RegExpExecArray | null;
    WORD_TAG_REGEX.lastIndex = 0;

    if (WORD_TAG_REGEX.test(current.words)) {
      WORD_TAG_REGEX.lastIndex = 0;
      while ((wordMatch = WORD_TAG_REGEX.exec(current.words)) !== null) {
        const timeStr = wordMatch[1];
        const wordText = wordMatch[2];

        if (wordMatch[0].trim()) {
          parts.push({
            startTimeMs: parseLrcTime(timeStr),
            words: wordText,
            durationMs: 0,
          });
        }
      }

      parts.sort((a, b) => a.startTimeMs - b.startTimeMs);

      for (let j = 0; j < parts.length; j++) {
        const pCurrent = parts[j];
        const pNext = parts[j + 1];
        const pDuration = pNext
          ? Math.max(0, pNext.startTimeMs - pCurrent.startTimeMs)
          : Math.max(0, current.startTimeMs + lineDurationMs - pCurrent.startTimeMs);

        pCurrent.durationMs = pDuration;
      }

      const plainText = current.words.replace(/<\d+:\d+(?:\.\d+)?>/g, "");

      result.push({
        startTimeMs: current.startTimeMs,
        words: plainText,
        durationMs: lineDurationMs,
        parts: parts.length > 0 ? parts : undefined,
      });
    } else {
      result.push({
        startTimeMs: current.startTimeMs,
        words: current.words,
        durationMs: lineDurationMs,
      });
    }
  }
  return result;
}
