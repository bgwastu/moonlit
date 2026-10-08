import type { Lyric } from "@/lib/lyrics";

/** Find the current line without scanning the whole song on every frame. */
export function findActiveLyric(lyrics: Lyric[], timeMs: number): number {
  let low = 0;
  let high = lyrics.length - 1;
  let active = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (lyrics[middle].startTimeMs <= timeMs) {
      active = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return active;
}

export function lyricWordProgress(
  timeMs: number,
  startMs: number,
  durationMs: number,
): number {
  if (timeMs < startMs) return 0;
  if (durationMs <= 0) return 1;
  return Math.min(1, (timeMs - startMs) / durationMs);
}
