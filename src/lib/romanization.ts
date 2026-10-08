import type { Lyric } from "@/lib/lyrics";

export const MAX_ROMANIZATION_LINES = 200;
export const MAX_ROMANIZATION_LINE_LENGTH = 1000;
export const MAX_ROMANIZATION_TEXT_LENGTH = 32000;
export const ROMANIZATION_VERSION =
  "kuroshiro-1.2.1-kuromoji-0.1.2-hepburn-koroman-1.0.16-rr-v1";
export const EMPTY_ROMANIZATIONS: ReadonlyMap<string, string> = new Map();

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const JAPANESE_TEXT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const HANGUL = /\p{Script=Hangul}/u;

export function hasJapaneseText(text: string): boolean {
  return JAPANESE_TEXT.test(text);
}

export function hasKoreanText(text: string): boolean {
  return HANGUL.test(text);
}

export function hasKana(text: string): boolean {
  return KANA.test(text);
}

/** Hangul is unambiguous; Han needs Japanese kana elsewhere or explicit language. */
export function getRomanizationLanguage(
  line: Lyric,
  inferredJapanese = false,
): "ja" | "ko" | undefined {
  if (line.isInstrumental) return undefined;
  if (line.language && !/^(?:ja|ko)(?:-|$)/i.test(line.language)) return undefined;
  if (hasKoreanText(line.words)) return "ko";
  const japanese = line.language
    ? /^ja(?:-|$)/i.test(line.language)
    : inferredJapanese || hasKana(line.words);
  return japanese && hasJapaneseText(line.words) ? "ja" : undefined;
}

export function getMissingRomanizationLines(lyrics: Lyric[]): string[] {
  const inferredJapanese = lyrics.some(
    (line) => !line.isInstrumental && !line.language && KANA.test(line.words),
  );
  return Array.from(
    new Set(
      lyrics
        .filter((line) => {
          return (
            getRomanizationLanguage(line, inferredJapanese) &&
            !line.romanization?.trim() &&
            line.words.length <= MAX_ROMANIZATION_LINE_LENGTH
          );
        })
        .map((line) => line.words),
    ),
  );
}

export function batchRomanizationLines(lines: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (
      batch.length >= MAX_ROMANIZATION_LINES ||
      length + line.length > MAX_ROMANIZATION_TEXT_LENGTH
    ) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(line);
    length += line.length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
