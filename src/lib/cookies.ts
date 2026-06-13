const COOKIES_KEY = "moonlit-yt-cookies";
const CUSTOM_COOKIES_ENABLED_KEY = "moonlit-custom-cookies-enabled";

/** Get user cookies from localStorage */
export async function getUserCookies(): Promise<string> {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(COOKIES_KEY) ?? "";
}

/** Save user cookies to localStorage */
export async function setUserCookies(content: string): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.setItem(COOKIES_KEY, content);
}

/** Get custom cookies enabled preference */
export async function isCustomCookiesEnabled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CUSTOM_COOKIES_ENABLED_KEY) === "true";
}

/** Set custom cookies enabled preference */
export async function setCustomCookiesEnabled(enabled: boolean): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_COOKIES_ENABLED_KEY, String(enabled));
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

/** Validate Netscape cookie format — each non-empty, non-comment line must have 7 tab-separated fields */
export function validateCookies(content: string): { valid: boolean; error?: string } {
  if (!content.trim()) return { valid: true };

  const lines = content.split("\n");
  let seenDataRow = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = trimmed.split("\t");
    if (parts.length < 7) {
      return {
        valid: false,
        error: `Each cookie line needs 7 tab-separated fields. Got ${parts.length}.`,
      };
    }
    seenDataRow = true;
  }

  if (!seenDataRow) {
    return {
      valid: false,
      error: "No valid cookie rows found.",
    };
  }

  return { valid: true };
}
