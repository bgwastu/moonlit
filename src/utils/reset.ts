import localforage from "localforage";

export interface ResetOptions {
  media: boolean;
  settings: boolean;
}

export async function resetAllData(
  options: ResetOptions = { media: true, settings: true },
) {
  try {
    if (options.media) {
      // Clear media store
      const mediaStore = localforage.createInstance({
        name: "moonlit",
        storeName: "media",
      });
      await mediaStore.clear();
    }

    if (options.settings) {
      // Clear settings store (cookies, etc)
      const settingsStore = localforage.createInstance({
        name: "moonlit",
        storeName: "settings",
      });
      await settingsStore.clear();

      // Clear all Moonlit-related localStorage keys (history, playback state)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("moonlit:")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }

    return true;
  } catch (error) {
    console.error("Failed to reset data:", error);
    return false;
  }
}
