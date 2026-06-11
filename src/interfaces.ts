export interface Media {
  fileUrl: string;
  sourceUrl: string;
  streamToken?: string;
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

export interface State {
  rate: number;
  semitones: number;
  reverbAmount: number;
  isRepeat: boolean;
  volume: number;
  lastUpdated: number;
  lyrics?: LyricsSettings | null;
  /** Whether lyrics should be shown */
  showLyrics?: boolean;
}
