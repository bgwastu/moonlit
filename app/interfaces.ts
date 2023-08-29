export interface SongMetadata {
  title: string;
  author: string;
  coverUrl: string;
}

export interface Song {
  fileUrl: string;
  metadata: SongMetadata;
}

export interface PlaybackSettings {
  playbackRate: number;
  reverbWet: number;
  reverbDecay: number;
  reverbPreDelay: number;
}