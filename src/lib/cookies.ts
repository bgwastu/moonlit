import localforage from "localforage";

const store = localforage.createInstance({
  name: "moonlit",
  storeName: "settings",
});

const COOKIES_KEY = "yt-cookies";
const CUSTOM_COOKIES_ENABLED_KEY = "custom-cookies-enabled";

/**
 * Get user cookies from local storage
 */
export async function getUserCookies(): Promise<string> {
  const value = await store.getItem<string>(COOKIES_KEY);
  return value ?? "";
}

/**
 * Save user cookies to local storage
 */
export async function setUserCookies(content: string): Promise<void> {
  // Normalize newlines to LF
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  await store.setItem(COOKIES_KEY, normalized);
}

/**
 * Check if user has configured their own cookies
 */
export async function hasUserCookies(): Promise<boolean> {
  const content = await getUserCookies();
  return content.trim().length > 0;
}

/**
 * Get preference for whether custom cookies are enabled
 * Defaults to false
 */
export async function isCustomCookiesEnabled(): Promise<boolean> {
  const value = await store.getItem<boolean>(CUSTOM_COOKIES_ENABLED_KEY);
  return value === true;
}

/**
 * Set preference for whether custom cookies are enabled
 */
export async function setCustomCookiesEnabled(enabled: boolean): Promise<void> {
  await store.setItem(CUSTOM_COOKIES_ENABLED_KEY, enabled);
}

/**
 * Get the cookies to use for a request
 * If custom cookies enabled AND user has cookies -> Use user cookies
 * Otherwise -> Empty string (server will use system cookies if available)
 */
export async function getCookiesToUse(): Promise<{ cookies: string }> {
  const customEnabled = await isCustomCookiesEnabled();

  if (customEnabled) {
    const userCookies = await getUserCookies();
    if (userCookies.trim().length > 0) {
      return { cookies: userCookies };
    }
  }

  // Empty means server decides (will use system cookies if available)
  return { cookies: "" };
}

/**
 * Validate Netscape cookie format
 */
export function validateCookies(content: string): {
  valid: boolean;
  error?: string;
} {
  if (!content.trim()) {
    return { valid: true }; // Empty is valid (just means no cookies)
  }

  const lines = content.split(/\r?\n/);
  const firstNonEmptyLine = lines.find((l) => l.trim().length > 0);

  // Check for Netscape format header
  if (
    firstNonEmptyLine &&
    !firstNonEmptyLine.startsWith("# Netscape HTTP Cookie File") &&
    !firstNonEmptyLine.startsWith("# HTTP Cookie File")
  ) {
    // Check if it looks like a cookie line (7 tab-separated fields)
    const isDataLine = firstNonEmptyLine.split("\t").length >= 7;
    if (!isDataLine && !firstNonEmptyLine.startsWith("#")) {
      return {
        valid: false,
        error:
          'Cookies must be in Netscape format. The file should start with "# Netscape HTTP Cookie File" or "# HTTP Cookie File"',
      };
    }
  }

  // Validate cookie lines (skip comments and empty lines)
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const parts = trimmed.split("\t");
    if (parts.length < 7) {
      return {
        valid: false,
        error: `Invalid cookie line: "${trimmed.substring(0, 50)}...". Each cookie line must have 7 tab-separated fields.`,
      };
    }
  }

  return { valid: true };
}
