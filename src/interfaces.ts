export interface Media {
  fileUrl: string;
  sourceUrl: string;
  /** Local file blob/URL for muted on-screen video (optional). YouTube uses embed. */
  videoUrl?: string;
  /** YouTube Music ATV (static art) — hide Show video; no real MV embed. */
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
  /** Whether advanced stretch mode (signalsmith-stretch pipeline) is enabled */
  advancedStretch?: boolean;
}
