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
function insertInstrumentalGaps(lyrics: Lyric[]): Lyric[] {
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

/** True when text looks like Apple / Better Lyrics TTML rather than LRC. */
function isTtml(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("<")) return false;
  return (
    /<(?:tt|div|p|span)\b/i.test(trimmed) && /ttml|itunes:timing|<p\b/i.test(trimmed)
  );
}

/**
 * Parse TTML clock values to milliseconds.
 * Supports: ss.xxx, mm:ss.xxx, hh:mm:ss.xxx
 */
function parseTtmlTime(timeStr: string): number {
  const raw = timeStr.trim();
  if (!raw) return 0;
  const parts = raw.split(":");
  if (parts.length === 1) {
    const sec = parseFloat(parts[0]);
    return Number.isFinite(sec) ? Math.round(sec * 1000) : 0;
  }
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10) || 0;
    const sec = parseFloat(parts[1]);
    if (!Number.isFinite(sec)) return min * 60000;
    return Math.round(min * 60000 + sec * 1000);
  }
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const sec = parseFloat(parts[2]);
  if (!Number.isFinite(sec)) return h * 3600000 + m * 60000;
  return Math.round(h * 3600000 + m * 60000 + sec * 1000);
}

function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name) ?? el.getAttribute(name.toLowerCase());
}

/**
 * Parse Apple Music–style TTML (word/syllable spans) into Lyric[].
 * Uses DOMParser (browser). Empty or invalid input returns [].
 */
function parseTTML(ttmlText: string, songDurationMs: number): Lyric[] {
  if (!ttmlText?.trim() || typeof DOMParser === "undefined") return [];

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(ttmlText, "application/xml");
  } catch {
    return [];
  }

  const parseError = doc.getElementsByTagName("parsererror");
  if (parseError.length > 0) return [];

  const paragraphs = Array.from(doc.getElementsByTagName("p"));
  if (paragraphs.length === 0) return [];

  const rawLines: Lyric[] = [];

  for (const p of paragraphs) {
    const lineBegin = getAttr(p, "begin");
    const lineEnd = getAttr(p, "end");
    if (!lineBegin) continue;

    const startTimeMs = parseTtmlTime(lineBegin);
    const endTimeMs = lineEnd ? parseTtmlTime(lineEnd) : startTimeMs;
    const lineDurationMs = Math.max(0, endTimeMs - startTimeMs);

    const parts: LyricPart[] = [];

    // Walk paragraph children so inter-span whitespace stays attached to words.
    const walkNodes = (parent: Element) => {
      for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          const ws = node.textContent ?? "";
          if (ws && parts.length > 0) {
            parts[parts.length - 1].words += ws;
          }
          continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === "span" && getAttr(el, "begin")) {
          const begin = getAttr(el, "begin")!;
          const end = getAttr(el, "end");
          const wordStart = parseTtmlTime(begin);
          const wordEnd = end ? parseTtmlTime(end) : wordStart;
          // Nested timed spans (syllables): flatten by walking; otherwise take text
          const nestedTimed = Array.from(el.children).some(
            (c) => c.tagName.toLowerCase() === "span" && getAttr(c, "begin"),
          );
          if (nestedTimed) {
            walkNodes(el);
          } else {
            parts.push({
              startTimeMs: wordStart,
              words: el.textContent ?? "",
              durationMs: Math.max(0, wordEnd - wordStart),
            });
          }
        } else if (tag === "span" || tag === "br") {
          walkNodes(el);
        }
      }
    };
    walkNodes(p);

    if (parts.length > 0) {
      const lineText =
        parts
          .map((part) => part.words)
          .join("")
          .replace(/\s+/g, " ")
          .trim() || (p.textContent ?? "").replace(/\s+/g, " ").trim();

      rawLines.push({
        startTimeMs,
        words: lineText,
        durationMs: lineDurationMs,
        parts,
      });
    } else {
      const lineText = (p.textContent ?? "").replace(/\s+/g, " ").trim();
      rawLines.push({
        startTimeMs,
        words: lineText,
        durationMs: lineDurationMs,
      });
    }
  }

  rawLines.sort((a, b) => a.startTimeMs - b.startTimeMs);

  // Fill duration from next line when end was missing / zero
  for (let i = 0; i < rawLines.length; i++) {
    const current = rawLines[i];
    const next = rawLines[i + 1];
    if (current.durationMs <= 0) {
      current.durationMs =
        next != null
          ? Math.max(0, next.startTimeMs - current.startTimeMs)
          : Math.max(0, songDurationMs - current.startTimeMs);
    }
  }

  return insertInstrumentalGaps(rawLines);
}

/** Dispatch TTML vs LRC based on content shape. */
export function parseSyncedLyrics(text: string, songDurationMs: number): Lyric[] {
  if (!text?.trim()) return [];
  if (isTtml(text)) return parseTTML(text, songDurationMs);
  return parseLRC(text, songDurationMs);
}
