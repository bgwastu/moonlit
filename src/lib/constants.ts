/** Max recent-play entries kept in localStorage. */
export const MAX_HISTORY_ITEMS = 50;

/** Max audio blobs kept in IndexedDB for offline replay. */
export const MAX_CACHED_TRACKS = 10;

/** Artwork is much smaller than audio; keep recent songs plus search thumbnails. */
export const MAX_CACHED_COVERS = 100;
export const MAX_CACHED_COVER_BYTES = 24 * 1024 * 1024;
