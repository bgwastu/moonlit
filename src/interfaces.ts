export interface SongMetadata {
  title: string;
  author: string;
  coverUrl: string;
}

export interface Song {
  fileUrl: string;
  metadata: SongMetadata;
}