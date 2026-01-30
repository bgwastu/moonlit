export interface Media {
  fileUrl: string;
  sourceUrl: string;
  metadata: {
    id: string | null;
    title: string;
    author: string;
    /** Artist(s) for music content */
    artist?: string;
    /** Album name for music content */
    album?: string;
    coverUrl: string;
  };
}

export interface HistoryItem extends Media {
  playedAt: number;
}

export interface State {
  position: number;
  rate: number;
  semitones: number;
  reverbAmount: number;
  pitchLockedToSpeed: boolean;
  isRepeat: boolean;
  volume: number;
  lastUpdated: number;
}
