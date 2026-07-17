import type { HistoryItem } from "@/interfaces";
import { MAX_HISTORY_ITEMS } from "@/lib/constants";

const HISTORY_STORAGE_KEY = "moonlit-history";

export function loadHistoryFromStorage(): HistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as HistoryItem[];
    if (!Array.isArray(parsed)) return [];
    // Drop local uploads — they were never meant to persist
    return parsed.filter((item) => !item?.sourceUrl?.startsWith("local:"));
  } catch (e) {
    console.error("Failed to load history:", e);
    return [];
  }
}

export function saveHistoryToStorage(history: HistoryItem[]): void {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)),
    );
  } catch (e) {
    console.error("Failed to save history:", e);
  }
}

export function clearHistoryStorage(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear history:", e);
  }
}
