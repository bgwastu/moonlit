import localforage from "localforage";
import { clearUserCookies } from "@/lib/cookies";
import { clearPlaybackPrefs, clearShowVideoPref } from "@/lib/playerPrefs";
import { clearMediaCache } from "@/utils/cache";

export interface ResetOptions {
  settings: boolean;
}

export async function resetAllData(options: ResetOptions = { settings: true }) {
  try {
    if (options.settings) {
      const settingsStore = localforage.createInstance({
        name: "moonlit",
        storeName: "settings",
      });
      await settingsStore.clear();
      await clearMediaCache();

      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("moonlit")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      clearUserCookies();
      clearShowVideoPref();
      clearPlaybackPrefs();
    }

    return true;
  } catch (error) {
    console.error("Failed to reset data:", error);
    return false;
  }
}
