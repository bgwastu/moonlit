import localforage from "localforage";
import { canonicalizeCookiesContent, validateCookiesContent } from "@/lib/cookieFormat";

const store = localforage.createInstance({
  name: "moonlit",
  storeName: "settings",
});

const COOKIES_KEY = "yt-cookies";
const CUSTOM_COOKIES_ENABLED_KEY = "custom-cookies-enabled";

/** Get user cookies from local storage */
export async function getUserCookies(): Promise<string> {
  const value = await store.getItem<string>(COOKIES_KEY);
  return value ?? "";
}

/** Save user cookies to local storage (canonical tab-separated Moz format) */
export async function setUserCookies(content: string): Promise<void> {
  await store.setItem(COOKIES_KEY, canonicalizeCookiesContent(content));
}

/** Get custom cookies enabled preference */
export async function isCustomCookiesEnabled(): Promise<boolean> {
  const value = await store.getItem<boolean>(CUSTOM_COOKIES_ENABLED_KEY);
  return value === true;
}

/** Set custom cookies enabled preference */
export async function setCustomCookiesEnabled(enabled: boolean): Promise<void> {
  await store.setItem(CUSTOM_COOKIES_ENABLED_KEY, enabled);
}

/** Get cookies to use for requests (user cookies if enabled, otherwise empty) */
export async function getCookiesToUse(): Promise<{ cookies: string }> {
  const customEnabled = await isCustomCookiesEnabled();
  if (customEnabled) {
    const userCookies = await getUserCookies();
    if (userCookies.trim().length > 0) {
      return { cookies: userCookies };
    }
  }
  return { cookies: "" };
}

/** Validate Netscape cookie format (tabs or pasted space-separated cookie rows) */
export function validateCookies(content: string): { valid: boolean; error?: string } {
  return validateCookiesContent(content);
}
