import { type LyricsSearchRecord, stripVideoTitleFiller } from "@/lib/lyrics";

export interface LyricsSearchTrack {
  title: string;
  artist: string;
  duration: number;
}

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function similarity(candidate: string, expected: string): number {
  const a = normalize(candidate);
  const b = normalize(expected);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const candidateWords = new Set(a.split(" "));
  const expectedWords = new Set(b.split(" "));
  let overlap = 0;
  for (const word of expectedWords) if (candidateWords.has(word)) overlap += 1;
  return overlap / Math.max(candidateWords.size, expectedWords.size);
}

/** Only usable synced results, with the right song and artist ahead of length alone. */
export function rankLyricsSearchResults(
  input: unknown,
  track: LyricsSearchTrack,
): LyricsSearchRecord[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  const records = input
    .filter((record): record is LyricsSearchRecord => {
      if (
        !record ||
        typeof record.id !== "number" ||
        !Number.isFinite(record.id) ||
        typeof record.trackName !== "string" ||
        typeof record.artistName !== "string" ||
        typeof record.syncedLyrics !== "string" ||
        !record.syncedLyrics.trim() ||
        seen.has(record.id)
      ) {
        return false;
      }
      seen.add(record.id);
      return true;
    })
    .map((record) => ({
      ...record,
      albumName: typeof record.albumName === "string" ? record.albumName : "",
      plainLyrics: typeof record.plainLyrics === "string" ? record.plainLyrics : null,
    }));

  const title = stripVideoTitleFiller(track.title);
  const nameScore = (record: LyricsSearchRecord) =>
    similarity(record.trackName, title) * 3 +
    similarity(record.artistName, track.artist) * 2;
  const durationDifference = (record: LyricsSearchRecord) =>
    track.duration > 0 && Number.isFinite(record.duration) && record.duration > 0
      ? Math.abs(record.duration - track.duration)
      : Number.POSITIVE_INFINITY;

  return records.sort(
    (a, b) =>
      nameScore(b) - nameScore(a) ||
      durationDifference(a) - durationDifference(b) ||
      a.id - b.id,
  );
}

/** A small excerpt lets listeners recognize a version before selecting it. */
export function getLyricsExcerpt(record: LyricsSearchRecord): string {
  const plain = record.plainLyrics?.trim();
  const source = plain || record.syncedLyrics || "";
  return source
    .split(/\r?\n/)
    .map((line) =>
      (plain
        ? line
        : line.replace(/\[(?:\d+:\d+(?:[.:]\d+)?|[a-z]+:[^\]]*)\]|<[^>]*>/gi, "")
      ).trim(),
    )
    .filter((line) => !/^\[[^\]]+\]$/.test(line))
    .filter((line) => line && !/^[♪♫\s]+$/.test(line))
    .slice(0, 2)
    .join(" · ");
}
