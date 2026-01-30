export interface Song {
  fileUrl: string;
  videoUrl?: string;
  metadata: {
    id: string | null;
    title: string;
    author: string;
    coverUrl: string;
    platform?: "youtube" | "tiktok";
  };
}

export interface HistoryItem extends Song {
  playedAt: number;
  originalUrl: string;
}

export interface PlaybackSettings {
  playbackRate: number;
}

export type PlaybackMode = "slowed" | "normal" | "speedup" | "custom";
