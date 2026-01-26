/**
 * Video State Management
 * Saves and restores playback state per video URL
 */

export interface VideoState {
  position: number; // Current playback position in seconds
  mode: "slowed" | "normal" | "speedup" | "custom";
  customRate: number;
  reverbAmount: number;
  isRepeat: boolean;
  lastUpdated: number; // Timestamp
}

const STORAGE_KEY_PREFIX = "moonlit:video:";
const MAX_STORED_VIDEOS = 50; // Limit to prevent localStorage bloat

/**
 * Get a storage key for a video URL
 */
export function getVideoStorageKey(url: string): string {
  // Create a simplified key from the URL
  try {
    const urlObj = new URL(url);
    // For YouTube: use video ID
    if (
      urlObj.hostname.includes("youtube") ||
      urlObj.hostname.includes("youtu.be")
    ) {
      const videoId =
        urlObj.searchParams.get("v") || urlObj.pathname.split("/").pop();
      return `${STORAGE_KEY_PREFIX}yt:${videoId}`;
    }
    // For TikTok: use video ID from path
    if (urlObj.hostname.includes("tiktok")) {
      const match = urlObj.pathname.match(/video\/(\d+)/);
      if (match) {
        return `${STORAGE_KEY_PREFIX}tt:${match[1]}`;
      }
    }
    // Fallback: use full URL hash
    return `${STORAGE_KEY_PREFIX}${btoa(url).slice(0, 32)}`;
  } catch {
    return `${STORAGE_KEY_PREFIX}${btoa(url).slice(0, 32)}`;
  }
}

/**
 * Save video state to localStorage
 */
export function saveVideoState(url: string, state: Partial<VideoState>): void {
  try {
    const key = getVideoStorageKey(url);
    const existing = getVideoState(url);

    const newState: VideoState = {
      position: state.position ?? existing?.position ?? 0,
      mode: state.mode ?? existing?.mode ?? "slowed",
      customRate: state.customRate ?? existing?.customRate ?? 1,
      reverbAmount: state.reverbAmount ?? existing?.reverbAmount ?? 0,
      isRepeat: state.isRepeat ?? existing?.isRepeat ?? false,
      lastUpdated: Date.now(),
    };

    localStorage.setItem(key, JSON.stringify(newState));

    // Cleanup old entries if too many
    cleanupOldEntries();
  } catch (e) {
    console.error("Failed to save video state:", e);
  }
}

/**
 * Get video state from localStorage
 */
export function getVideoState(url: string): VideoState | null {
  try {
    const key = getVideoStorageKey(url);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as VideoState;
  } catch (e) {
    console.error("Failed to get video state:", e);
    return null;
  }
}

/**
 * Clear video state for a specific URL
 */
export function clearVideoState(url: string): void {
  try {
    const key = getVideoStorageKey(url);
    localStorage.removeItem(key);
  } catch (e) {
    console.error("Failed to clear video state:", e);
  }
}

/**
 * Cleanup old entries to prevent localStorage bloat
 */
function cleanupOldEntries(): void {
  try {
    const entries: { key: string; lastUpdated: number }[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        const data = localStorage.getItem(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            entries.push({ key, lastUpdated: parsed.lastUpdated || 0 });
          } catch {
            // Remove corrupted entries
            localStorage.removeItem(key);
          }
        }
      }
    }

    // If we have too many entries, remove the oldest ones
    if (entries.length > MAX_STORED_VIDEOS) {
      entries.sort((a, b) => a.lastUpdated - b.lastUpdated);
      const toRemove = entries.slice(0, entries.length - MAX_STORED_VIDEOS);
      toRemove.forEach(({ key }) => localStorage.removeItem(key));
    }
  } catch (e) {
    console.error("Failed to cleanup old entries:", e);
  }
}

/**
 * Get initial state from URL parameters (for shared links)
 * This is read-only - we don't update URL params after initial load
 */
export function getStateFromUrlParams(): {
  mode?: "slowed" | "normal" | "speedup" | "custom";
  rate?: number;
  startAt?: number;
} {
  if (typeof window === "undefined") return {};

  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const rate = params.get("rate");
    const startAt = params.get("startAt");

    const result: ReturnType<typeof getStateFromUrlParams> = {};

    if (mode && ["slowed", "normal", "speedup", "custom"].includes(mode)) {
      result.mode = mode as typeof result.mode;
    }

    if (rate) {
      const parsedRate = parseFloat(rate);
      if (!isNaN(parsedRate) && parsedRate >= 0.1 && parsedRate <= 2) {
        result.rate = parsedRate;
      }
    }

    if (startAt) {
      const parsedStartAt = parseInt(startAt);
      if (!isNaN(parsedStartAt) && parsedStartAt >= 0) {
        result.startAt = parsedStartAt;
      }
    }

    return result;
  } catch {
    return {};
  }
}
