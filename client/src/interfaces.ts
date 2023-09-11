export interface Song {
  fileUrl: string;
  metadata: {
    title: string;
    author: string;
    coverUrl: string;
  };
}

export interface PlaybackSettings {
  playbackRate: number;
  reverbWet: number;
  reverbDecay: number;
  reverbPreDelay: number;
}
