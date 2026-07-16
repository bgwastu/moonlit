const COOKIES_KEY = "moonlit-yt-cookies";
const CUSTOM_COOKIES_ENABLED_KEY = "moonlit-custom-cookies-enabled";

export const MOONLIT_COOKIES_HEADER = "X-Moonlit-Cookies";

/** Get user cookies from localStorage */
export function getUserCookies(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(COOKIES_KEY) ?? "";
}

/** Save user cookies to localStorage */
export function setUserCookies(content: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(COOKIES_KEY, content);
}

/** Get custom cookies enabled preference */
export function isCustomCookiesEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CUSTOM_COOKIES_ENABLED_KEY) === "true";
}

/** Set custom cookies enabled preference */
export function setCustomCookiesEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_COOKIES_ENABLED_KEY, String(enabled));
}

/** Get cookies to use for requests (user cookies if enabled, otherwise empty) */
export function getCookiesToUse(): { cookies: string } {
  if (isCustomCookiesEnabled()) {
    const userCookies = getUserCookies();
    if (userCookies.trim().length > 0) {
      return { cookies: userCookies };
    }
  }
  return { cookies: "" };
}

/** Headers to attach when calling server APIs that accept user cookies. */
export function cookieRequestHeaders(): HeadersInit {
  const { cookies } = getCookiesToUse();
  if (!cookies.trim()) return {};
  return { [MOONLIT_COOKIES_HEADER]: cookies };
}

/** Read user cookies sent from the client on a server request. */
export function readRequestCookies(request: Request): string | undefined {
  const cookies = request.headers.get(MOONLIT_COOKIES_HEADER)?.trim();
  return cookies || undefined;
}

/** Remove saved user cookies and the enable preference. */
export function clearUserCookies(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(COOKIES_KEY);
  localStorage.removeItem(CUSTOM_COOKIES_ENABLED_KEY);
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
