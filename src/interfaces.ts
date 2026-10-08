export interface Media {
  fileUrl: string;
  sourceUrl: string;
  /** Local file video; optional YouTube video is prepared separately by the player. */
  videoUrl?: string;
  /** YouTube Music ATV (static art) — hide Show video. */
  isAudioTrackVideo?: boolean;
  metadata: {
    id: string | null;
    title: string;
    author: string;
    artist?: string;
    album?: string;
    coverUrl: string;
  };
}

export interface HistoryItem extends Media {
  playedAt: number;
}

export interface LyricsSettings {
  id: number | null;
  syncedLyrics: string | null;
  trackName: string | null;
  artistName: string | null;
  albumName?: string | null;
  offset: number; // in seconds, +/- to shift timing
}
