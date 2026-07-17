const STORAGE_PREFIX = "moonlit-atv:";
const atvIds = new Set<string>();

function storageKey(id: string) {
  return `${STORAGE_PREFIX}${id}`;
}

/** Remember YouTube Music ATV (no real MV) so cache-only replays hide Show video. */
export function markAudioTrackVideo(id: string | null | undefined, isAtv: boolean): void {
  if (!id) return;
  if (isAtv) {
    atvIds.add(id);
    try {
      sessionStorage.setItem(storageKey(id), "1");
    } catch {
      // ignore
    }
  } else {
    atvIds.delete(id);
    try {
      sessionStorage.removeItem(storageKey(id));
    } catch {
      // ignore
    }
  }
}

export function isMarkedAudioTrackVideo(id: string | null | undefined): boolean {
  if (!id) return false;
  if (atvIds.has(id)) return true;
  try {
    if (sessionStorage.getItem(storageKey(id)) === "1") {
      atvIds.add(id);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}
