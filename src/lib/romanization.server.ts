import { romanize as romanizeKorean } from "koroman";
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import {
  ROMANIZATION_VERSION,
  hasJapaneseText,
  hasKana,
  hasKoreanText,
} from "@/lib/romanization";

const MAX_CACHE_LINES = 2000;
const cache = new Map<string, string | null>();
let converterPromise: Promise<Kuroshiro> | undefined;

function getConverter(): Promise<Kuroshiro> {
  if (!converterPromise) {
    converterPromise = (async () => {
      const converter = new Kuroshiro();
      // The external analyzer resolves its dictionary using native Node resolution.
      await converter.init(new KuromojiAnalyzer());
      return converter;
    })().catch((error) => {
      converterPromise = undefined;
      throw error;
    });
  }
  return converterPromise;
}

export async function romanizeLyrics(lines: string[]): Promise<(string | null)[]> {
  const results: (string | null)[] = [];
  for (const line of lines) {
    const korean = hasKoreanText(line);
    const japanese = hasJapaneseText(line) && (!korean || hasKana(line));
    if (!korean && !japanese) {
      results.push(null);
      continue;
    }
    const key = `${ROMANIZATION_VERSION}:${line}`;
    if (cache.has(key)) {
      const cached = cache.get(key)!;
      cache.delete(key);
      cache.set(key, cached);
      results.push(cached);
      continue;
    }
    let converted = line.normalize("NFC");
    if (japanese) {
      const converter = await getConverter();
      converted = await converter.convert(converted, {
        to: "romaji",
        mode: "spaced",
        romajiSystem: "hepburn",
      });
    }
    if (korean) {
      // Convert Hangul runs so the converter's casing rules leave English untouched.
      converted = converted.replace(/\p{Script=Hangul}+/gu, (hangul) =>
        romanizeKorean(hangul, {
          usePronunciationRules: true,
          useCustomDictionary: false,
        }),
      );
    }
    const text = converted
      .replace(/\s+/g, " ")
      .replace(/\s+([,.!?;:、。！？])/g, "$1")
      .replace(/([([{「『])\s+/g, "$1")
      .trim();
    const romanization =
      /[a-zāīūēō]/i.test(text) && converted !== line.normalize("NFC") ? text : null;
    cache.set(key, romanization);
    if (cache.size > MAX_CACHE_LINES) cache.delete(cache.keys().next().value!);
    results.push(romanization);
  }
  return results;
}
