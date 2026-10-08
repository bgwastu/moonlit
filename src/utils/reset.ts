import { clearUserCookies } from "@/lib/cookies";
import { clearStoredSettings } from "@/lib/storage";

export interface ResetOptions {
  settings: boolean;
}

export async function resetAllData(options: ResetOptions = { settings: true }) {
  try {
    if (options.settings) {
      await clearStoredSettings();
      clearUserCookies();
    }
    return true;
  } catch (error) {
    console.error("Failed to reset data:", error);
    return false;
  }
}
