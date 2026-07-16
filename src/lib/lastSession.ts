import type { Media } from "@/interfaces";

const LAST_SESSION_KEY = "moonlit-last-session";
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export type LastSession = {
  savedAt: number;
  sourceUrl: string;
  metadata: Media["metadata"];
  mode: "mini" | "expanded";
  /** Playback position in seconds when the session was last saved. */
  positionSeconds?: number;
};

function isRestorableUrl(sourceUrl: string) {
  return (
    sourceUrl.startsWith("http://") ||
    sourceUrl.startsWith("https://") ||
    sourceUrl.startsWith("/")
  );
}

export function loadLastSession(): LastSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastSession;
    if (!parsed?.sourceUrl || !parsed?.savedAt) {
      localStorage.removeItem(LAST_SESSION_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(LAST_SESSION_KEY);
      return null;
    }
    if (!isRestorableUrl(parsed.sourceUrl)) {
      localStorage.removeItem(LAST_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLastSession(session: LastSession) {
  if (typeof window === "undefined") return;
  if (!isRestorableUrl(session.sourceUrl)) return;
  try {
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.error("Failed to save last session:", e);
  }
}

/** Merge fields into the existing last-session entry (no-op if none / URL mismatch). */
export function patchLastSession(
  sourceUrl: string,
  partial: Partial<Omit<LastSession, "sourceUrl">>,
): void {
  if (typeof window === "undefined") return;
  if (!isRestorableUrl(sourceUrl)) return;
  try {
    const existing = loadLastSession();
    if (!existing || existing.sourceUrl !== sourceUrl) return;
    saveLastSession({
      ...existing,
      ...partial,
      sourceUrl,
      savedAt: Date.now(),
    });
  } catch (e) {
    console.error("Failed to patch last session:", e);
  }
}

export function clearLastSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    // ignore
  }
}
