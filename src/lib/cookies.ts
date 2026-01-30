import localforage from "localforage";

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

/** Save user cookies to local storage */
export async function setUserCookies(content: string): Promise<void> {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  await store.setItem(COOKIES_KEY, normalized);
}

/** Check if user has configured cookies */
export async function hasUserCookies(): Promise<boolean> {
  const content = await getUserCookies();
  return content.trim().length > 0;
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

/** Validate Netscape cookie format */
export function validateCookies(content: string): { valid: boolean; error?: string } {
  if (!content.trim()) return { valid: true };

  const lines = content.split(/\r?\n/);
  const firstNonEmptyLine = lines.find((l) => l.trim().length > 0);

  if (
    firstNonEmptyLine &&
    !firstNonEmptyLine.startsWith("# Netscape HTTP Cookie File") &&
    !firstNonEmptyLine.startsWith("# HTTP Cookie File")
  ) {
    const isDataLine = firstNonEmptyLine.split("\t").length >= 7;
    if (!isDataLine && !firstNonEmptyLine.startsWith("#")) {
      return {
        valid: false,
        error:
          'Cookies must be in Netscape format (start with "# Netscape HTTP Cookie File")',
      };
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.split("\t").length < 7) {
      return {
        valid: false,
        error: `Invalid cookie line: "${trimmed.substring(0, 50)}...". Each line must have 7 tab-separated fields.`,
      };
    }
  }

  return { valid: true };
}
