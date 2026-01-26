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

export interface PlaybackSettings {
  playbackRate: number;
  reverbWet: number;
  reverbDecay: number;
  reverbPreDelay: number;
}

export type PlaybackMode = "slowed" | "normal" | "speedup" | "custom";
