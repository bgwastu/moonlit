const SHOW_VIDEO_KEY = "moonlit-show-video";
const PLAYBACK_PREFS_KEY = "moonlit-playback-prefs";

export type GlobalPlaybackMode = "slowed" | "normal" | "speedup" | "custom";

export interface GlobalPlaybackPrefs {
  mode: GlobalPlaybackMode;
  rate: number;
  semitones: number;
  reverbAmount: number;
  isRepeat: boolean;
  volume: number;
  advancedStretch: boolean;
  showLyrics: boolean;
  slowedRate: number;
  normalRate: number;
  speedupRate: number;
  customRate: number;
  customSemitones: number;
}

const DEFAULT_PLAYBACK_PREFS: GlobalPlaybackPrefs = {
  mode: "normal",
  rate: 1,
  semitones: 0,
  reverbAmount: 0,
  isRepeat: false,
  volume: 1,
  advancedStretch: false,
  showLyrics: false,
  slowedRate: 0.8,
  normalRate: 1,
  speedupRate: 1.25,
  customRate: 1,
  customSemitones: 0,
};

/**
 * Global show-video preference.
 * Missing key ⇒ on (YouTube embeds / local file video show by default).
 * Explicit `"0"` ⇒ user disabled; `"1"` ⇒ user enabled.
 */
export function getShowVideo(): boolean {
  try {
    return localStorage.getItem(SHOW_VIDEO_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setShowVideo(enabled: boolean): void {
  try {
    localStorage.setItem(SHOW_VIDEO_KEY, enabled ? "1" : "0");
  } catch (e) {
    console.error("Failed to save showVideo preference:", e);
  }
}

export function clearShowVideoPref(): void {
  try {
    localStorage.removeItem(SHOW_VIDEO_KEY);
  } catch {}
}

export function getPlaybackPrefs(): GlobalPlaybackPrefs {
  try {
    const raw = localStorage.getItem(PLAYBACK_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PLAYBACK_PREFS };
    const parsed = JSON.parse(raw) as Partial<GlobalPlaybackPrefs>;
    return { ...DEFAULT_PLAYBACK_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PLAYBACK_PREFS };
  }
}

export function savePlaybackPrefs(partial: Partial<GlobalPlaybackPrefs>): void {
  try {
    const next = { ...getPlaybackPrefs(), ...partial };
    localStorage.setItem(PLAYBACK_PREFS_KEY, JSON.stringify(next));
  } catch (e) {
    console.error("Failed to save playback preferences:", e);
  }
}

export function clearPlaybackPrefs(): void {
  try {
    localStorage.removeItem(PLAYBACK_PREFS_KEY);
  } catch {}
}
