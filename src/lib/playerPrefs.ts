const SHOW_VIDEO_KEY = "moonlit-show-video";

export function getShowVideo(): boolean {
  try {
    return localStorage.getItem(SHOW_VIDEO_KEY) === "1";
  } catch {
    return false;
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
