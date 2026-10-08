import type { HistoryItem } from "@/interfaces";
import { MAX_HISTORY_ITEMS } from "@/lib/constants";
import { durableCoverUrl } from "@/lib/coverUrl";
import { getYouTubeId } from "@/utils";

const HISTORY_STORAGE_KEY = "moonlit-history";

function durableHistoryItem(item: HistoryItem): HistoryItem {
  return {
    ...item,
    metadata: {
      ...item.metadata,
      coverUrl: durableCoverUrl(
        item.metadata?.coverUrl,
        getYouTubeId(item.sourceUrl) || item.metadata?.id,
      ),
    },
  };
}

export function loadHistoryFromStorage(): HistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as HistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.sourceUrl).map(durableHistoryItem);
  } catch (e) {
    console.error("Failed to load history:", e);
    return [];
  }
}

export function saveHistoryToStorage(history: HistoryItem[]): void {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS).map(durableHistoryItem)),
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
