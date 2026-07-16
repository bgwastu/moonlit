/**
 * Lyric types and LRC parser compatible with better-lyrics style display.
 * LRC format: [mm:ss.xx] or [mm:ss] line text, optionally enhanced: <mm:ss.xx>word</mm:ss.xx> or just <mm:ss.xx>word
 */

/**
 * Normalize video titles for LRCLib: drop all parenthetical segments `(...)` (handles
 * nesting by removing innermost pairs first), collapse whitespace, then strip common
 * trailing upload suffixes outside parentheses. If the result is empty, returns the
 * original trimmed string.
 */
export function stripVideoTitleFiller(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  let s = trimmed;

  let prevParen = "";
  while (s !== prevParen) {
    prevParen = s;
    s = s.replace(/\([^()]*\)/g, "");
  }
  s = s.replace(/\s+/g, " ").trim();

  let prev = "";
  while (s !== prev) {
    prev = s;

    s = s
      .replace(
        /\s*[-–—|]\s*(?:official\s*)?(?:lyrics?|music)\s*video(?:\s*4k|\s*hd)?\s*$/i,
        "",
      )
      .replace(/\s*[-–—|]\s*(?:official\s*)?audio\s*$/i, "")
      .trim();

    s = s
      .replace(/\s+(?:official\s*)?(?:lyrics?|music)\s*video(?:\s*4k|\s*hd)?\s*$/i, "")
      .replace(/\s+(?:official\s*)?audio\s*$/i, "")
      .trim();
  }

  s = s.replace(/\s*[-–—|]+\s*$/, "").trim();

  return s || trimmed;
}

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
  /** True for synthesized or source beat/instrumental placeholders (♪). */
  isInstrumental?: boolean;
}

/** Gaps at least this long can get a ♪ (lead-in, outro, or clear break). */
const LONG_PAUSE_MS = 8000;
/**
 * Between two sung lines, only invent a ♪ when the span is clearly an
 * instrumental break — shorter spans are usually still the same phrase.
 */
const BETWEEN_LINES_PAUSE_MS = 15000;
/** Don't insert a ♪ shorter than this. */
const MIN_INSTRUMENTAL_MS = 2500;
const MIN_LINE_ACTIVE_MS = 2000;
const MAX_LINE_ACTIVE_MS = 12000;

const NOTE_ONLY_RE = /^[♪♫\s·.•\-—–]+$/;

function isInstrumentalText(words: string): boolean {
  const trimmed = words.trim();
  return !trimmed || NOTE_ONLY_RE.test(trimmed);
}

/** Rough sing-window when LRC has no word-level end times. */
function estimateSingDurationMs(line: Lyric): number {
  if (line.parts && line.parts.length > 0) {
    const last = line.parts[line.parts.length - 1];
    const sungMs = last.startTimeMs + last.durationMs - line.startTimeMs;
    return Math.min(MAX_LINE_ACTIVE_MS, Math.max(MIN_LINE_ACTIVE_MS, sungMs));
  }
  const text = line.words.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const byLength = 1500 + text.length * 80;
  const byWords = 1500 + wordCount * 450;
  return Math.min(
    MAX_LINE_ACTIVE_MS,
    Math.max(MIN_LINE_ACTIVE_MS, Math.min(byLength, byWords)),
  );
}

function instrumentalLine(startTimeMs: number, durationMs: number): Lyric {
  return {
    startTimeMs,
    words: "♪",
    durationMs: Math.max(0, durationMs),
    isInstrumental: true,
  };
}

/**
 * Insert ♪ placeholders for long intros, explicit empty LRC rows, clear
 * mid-song breaks, and outros — without cutting short still-sung lines.
 */
export function insertInstrumentalGaps(lyrics: Lyric[]): Lyric[] {
  if (lyrics.length === 0) return lyrics;

  const result: Lyric[] = [];

  const first = lyrics[0];
  if (first.startTimeMs >= LONG_PAUSE_MS) {
    result.push(instrumentalLine(0, first.startTimeMs));
  }

  for (let i = 0; i < lyrics.length; i++) {
    const line = lyrics[i];
    const next = lyrics[i + 1];
    const spanMs =
      next != null
        ? Math.max(0, next.startTimeMs - line.startTimeMs)
        : Math.max(0, line.durationMs);
    const isLast = next == null;

    if (isInstrumentalText(line.words)) {
      const prev = result[result.length - 1];
      if (prev?.isInstrumental) {
        prev.durationMs += spanMs;
      } else {
        result.push(instrumentalLine(line.startTimeMs, spanMs));
      }
      continue;
    }

    const singMs = Math.min(estimateSingDurationMs(line), spanMs);
    const silenceMs = spanMs - singMs;
    // Lead-out / last line: use the normal pause threshold.
    // Between sung lines: require a much longer span so held phrases
    // (e.g. 10–12s) are not replaced with ♪ mid-line.
    const pauseThreshold = isLast ? LONG_PAUSE_MS : BETWEEN_LINES_PAUSE_MS;
    const shouldInsertBeat = spanMs >= pauseThreshold && silenceMs >= LONG_PAUSE_MS;

    if (shouldInsertBeat) {
      const activeMs = Math.min(singMs, spanMs - MIN_INSTRUMENTAL_MS);
      result.push({
        ...line,
        durationMs: activeMs,
        isInstrumental: false,
      });
      result.push(instrumentalLine(line.startTimeMs + activeMs, spanMs - activeMs));
      continue;
    }

    result.push({
      ...line,
      words: line.words,
      durationMs: spanMs,
      isInstrumental: false,
    });
  }

  return result;
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
 * Entries that have synced lyrics, ordered like the lyrics picker: prefer duration
 * within ±1s of the track, then closest duration.
 */
export function sortLyricsSearchRecordsForTrack(
  records: LyricsSearchRecord[],
  durationSeconds: number,
): LyricsSearchRecord[] {
  return records
    .filter((r) => !!r.syncedLyrics?.trim())
    .sort((a, b) => {
      const aDiff = Math.abs((a.duration || 0) - durationSeconds);
      const bDiff = Math.abs((b.duration || 0) - durationSeconds);
      const aMatches = aDiff <= 1;
      const bMatches = bDiff <= 1;
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return aDiff - bDiff;
    });
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
  return insertInstrumentalGaps(result);
}
