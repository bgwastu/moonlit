import { State } from "@/interfaces";

const STORAGE_KEY_PREFIX = "moonlit:video:";
const MAX_STORED_VIDEOS = 50;

/** Derive playback mode from rate value */
export function getModeFromRate(
  rate: number,
): "slowed" | "normal" | "speedup" | "custom" {
  if (Math.abs(rate - 0.8) < 0.01) return "slowed";
  if (Math.abs(rate - 1) < 0.01) return "normal";
  if (Math.abs(rate - 1.25) < 0.01) return "speedup";
  return "custom";
}

/** Generate storage key from video URL */
export function getVideoStorageKey(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("youtube") || urlObj.hostname.includes("youtu.be")) {
      const videoId = urlObj.searchParams.get("v") || urlObj.pathname.split("/").pop();
      return `${STORAGE_KEY_PREFIX}yt:${videoId}`;
    }
    if (urlObj.hostname.includes("tiktok")) {
      const match = urlObj.pathname.match(/video\/(\d+)/);
      if (match) return `${STORAGE_KEY_PREFIX}tt:${match[1]}`;
    }
    return `${STORAGE_KEY_PREFIX}${btoa(url).slice(0, 32)}`;
  } catch {
    return `${STORAGE_KEY_PREFIX}${btoa(url).slice(0, 32)}`;
  }
}

/** Save video playback state to localStorage */
export function saveVideoState(url: string, state: Partial<State>): void {
  try {
    const key = getVideoStorageKey(url);
    const existing = getVideoState(url);

    const newState: State = {
      position: state.position ?? existing?.position ?? 0,
      rate: state.rate ?? existing?.rate ?? 1,
      semitones: state.semitones ?? existing?.semitones ?? 0,
      reverbAmount: state.reverbAmount ?? existing?.reverbAmount ?? 0,
      pitchLockedToSpeed:
        state.pitchLockedToSpeed ?? existing?.pitchLockedToSpeed ?? true,
      isRepeat: state.isRepeat ?? existing?.isRepeat ?? false,
      volume: state.volume ?? existing?.volume ?? 1,
      lastUpdated: Date.now(),
      lyrics: state.lyrics !== undefined ? state.lyrics : (existing?.lyrics ?? null),
      videoDisabled:
        state.videoDisabled !== undefined
          ? state.videoDisabled
          : (existing?.videoDisabled ?? false),
      showLyrics:
        state.showLyrics !== undefined
          ? state.showLyrics
          : (existing?.showLyrics ?? false),
    };

    localStorage.setItem(key, JSON.stringify(newState));
    cleanupOldEntries();
  } catch (e) {
    console.error("Failed to save video state:", e);
  }
}

/** Get video playback state from localStorage */
export function getVideoState(url: string): State | null {
  try {
    const key = getVideoStorageKey(url);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as State;
  } catch {
    return null;
  }
}

/** Clear video state for a URL */
export function clearVideoState(url: string): void {
  try {
    localStorage.removeItem(getVideoStorageKey(url));
  } catch {}
}

/** Remove oldest entries when exceeding storage limit */
function cleanupOldEntries(): void {
  try {
    const entries: { key: string; lastUpdated: number }[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_KEY_PREFIX)) {
        const data = localStorage.getItem(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            entries.push({ key, lastUpdated: parsed.lastUpdated || 0 });
          } catch {
            localStorage.removeItem(key);
          }
        }
      }
    }

    if (entries.length > MAX_STORED_VIDEOS) {
      entries.sort((a, b) => a.lastUpdated - b.lastUpdated);
      entries.slice(0, entries.length - MAX_STORED_VIDEOS).forEach(({ key }) => {
        localStorage.removeItem(key);
      });
    }
  } catch {}
}
