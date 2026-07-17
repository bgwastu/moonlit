const COOKIES_KEY = "moonlit-yt-cookies";
const CUSTOM_COOKIES_ENABLED_KEY = "moonlit-custom-cookies-enabled";

export const MOONLIT_COOKIES_HEADER = "X-Moonlit-Cookies";
export const COOKIES_CHANGED_EVENT = "moonlit:cookies-changed";
const COOKIE_HEADER_PREFIX = "b64:";

/** Notify listeners (e.g. status chip) that user cookie settings changed. */
export function notifyCookiesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIES_CHANGED_EVENT));
}

/** Hosts we keep from a cookies.txt export (unrelated hosts are stripped). */
const ALLOWED_COOKIE_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "youtubekids.com",
  "youtube-nocookie.com",
  "googlevideo.com",
  "google.com",
  "googleapis.com",
  "gstatic.com",
  "ytimg.com",
  "ggpht.com",
] as const;

/**
 * Strong session markers — SID alone is too weak (easy to fake; often present
 * without a usable YouTube login).
 */
const SESSION_COOKIE_NAMES = ["LOGIN_INFO", "__Secure-1PSID", "__Secure-3PSID"] as const;

type CookieRow = {
  domain: string;
  name: string;
  value: string;
  rawLine: string;
};

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

function isAllowedCookieDomain(domain: string): boolean {
  const host = domain.trim().replace(/^\./, "").toLowerCase();
  if (!host) return false;
  return ALLOWED_COOKIE_DOMAINS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

function isYoutubeHost(domain: string): boolean {
  const host = domain.trim().replace(/^\./, "").toLowerCase();
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".youtu.be") ||
    host === "youtubekids.com" ||
    host.endsWith(".youtubekids.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  );
}

function parseNetscapeRows(content: string): CookieRow[] | { error: string } {
  const rows: CookieRow[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = trimmed.split("\t");
    if (parts.length < 7) {
      return {
        error: `Each cookie line needs 7 tab-separated fields. Got ${parts.length}.`,
      };
    }

    const domain = parts[0]?.trim() ?? "";
    const name = parts[5]?.trim() ?? "";
    const value = parts[6]?.trim() ?? "";
    if (!domain || !name) {
      return { error: "Cookie rows must include a domain and name." };
    }
    rows.push({ domain, name, value, rawLine: line });
  }

  return rows;
}

/** Reject obvious placeholders / too-short gibberish for session cookies. */
function looksLikeAuthCookieValue(name: string, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.length < 12) return false;
  if (
    /^(test|foo|bar|baz|asdf|qwer|xxx+|placeholder|gibberish|sample|dummy|null|undefined)$/i.test(
      v,
    )
  ) {
    return false;
  }
  if (/^(.)\1{7,}$/.test(v)) return false;

  if (name === "SAPISID" || name === "APISID" || name === "HSID" || name === "SSID") {
    return /^\d{8,14}_[\w-]{8,}$/.test(v) || v.length >= 20;
  }
  if (name.startsWith("__Secure-") && name.includes("PSID")) {
    return v.length >= 20;
  }
  if (name === "LOGIN_INFO") {
    return v.length >= 40;
  }
  if (name === "SID") {
    return v.length >= 20;
  }
  return v.length >= 16;
}

/**
 * Keep only YouTube/Google rows and ensure a real session cookie is present.
 * Extra domains from browser exports are ignored (not a hard error).
 */
export function filterYoutubeCookies(
  content: string,
): { ok: true; cookies: string } | { ok: false; error: string } {
  if (!content.trim()) {
    return { ok: false, error: "No cookies provided." };
  }

  if (!content.includes("\t")) {
    return {
      ok: false,
      error:
        "Paste a Netscape cookies.txt export (tab-separated, with domains). Raw cookie strings are not accepted.",
    };
  }

  const parsed = parseNetscapeRows(content);
  if (!Array.isArray(parsed)) return { ok: false, error: parsed.error };

  if (parsed.length === 0) {
    return { ok: false, error: "No valid cookie rows found." };
  }

  const allowed = parsed.filter((row) => isAllowedCookieDomain(row.domain));
  if (allowed.length === 0) {
    return {
      ok: false,
      error: "No YouTube/Google cookies found in the export.",
    };
  }

  if (!allowed.some((row) => isYoutubeHost(row.domain))) {
    return {
      ok: false,
      error: "Export must include cookies for youtube.com (not only other Google sites).",
    };
  }

  const sessionRows = allowed.filter(
    (row) =>
      (SESSION_COOKIE_NAMES as readonly string[]).includes(row.name) &&
      looksLikeAuthCookieValue(row.name, row.value),
  );
  if (sessionRows.length === 0) {
    return {
      ok: false,
      error:
        "Missing a usable YouTube session cookie (LOGIN_INFO or __Secure-1PSID / __Secure-3PSID). Export while signed into YouTube.",
    };
  }

  const header = "# Netscape HTTP Cookie File (YouTube-filtered)";
  const cookies = [header, ...allowed.map((row) => row.rawLine.trimEnd())].join("\n");
  return { ok: true, cookies: `${cookies}\n` };
}

/** Validate Netscape YouTube cookies — format and session markers. */
export function validateCookies(content: string): { valid: boolean; error?: string } {
  if (!content.trim()) return { valid: true };
  const filtered = filterYoutubeCookies(content);
  if (filtered.ok === false) return { valid: false, error: filtered.error };
  return { valid: true };
}

/** Return filtered cookies when custom cookies are enabled and valid. */
export function getCookiesToUse(): { cookies: string } {
  if (!isCustomCookiesEnabled()) return { cookies: "" };
  const userCookies = getUserCookies();
  if (!userCookies.trim()) return { cookies: "" };
  const filtered = filterYoutubeCookies(userCookies);
  if (filtered.ok === false) return { cookies: "" };
  return { cookies: filtered.cookies };
}

function encodeCookieHeaderValue(cookies: string): string {
  // Browser fetch rejects header values with raw newlines (Netscape dumps).
  const bytes = new TextEncoder().encode(cookies);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${COOKIE_HEADER_PREFIX}${btoa(binary)}`;
}

function decodeCookieHeaderValue(value: string): string {
  if (!value.startsWith(COOKIE_HEADER_PREFIX)) {
    return value;
  }
  const encoded = value.slice(COOKIE_HEADER_PREFIX.length);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(encoded, "base64").toString("utf8");
  }
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Headers to attach when calling server APIs that accept user cookies. */
export function cookieRequestHeaders(): HeadersInit {
  const { cookies } = getCookiesToUse();
  if (!cookies.trim()) return {};
  return { [MOONLIT_COOKIES_HEADER]: encodeCookieHeaderValue(cookies) };
}

export type RequestCookiesResult =
  | { status: "missing" }
  | { status: "invalid"; error: string }
  | { status: "ok"; cookies: string };

/** Decode + validate user cookies from the request header. */
export function readRequestCookiesResult(request: Request): RequestCookiesResult {
  const encoded = request.headers.get(MOONLIT_COOKIES_HEADER)?.trim();
  if (!encoded) return { status: "missing" };

  let decoded: string;
  try {
    decoded = decodeCookieHeaderValue(encoded).trim();
  } catch {
    return { status: "invalid", error: "Could not decode cookie header." };
  }

  if (!decoded) return { status: "missing" };

  const filtered = filterYoutubeCookies(decoded);
  if (filtered.ok === false) {
    return { status: "invalid", error: filtered.error };
  }

  return { status: "ok", cookies: filtered.cookies };
}

/** Read valid user cookies from the request, or undefined if missing/invalid. */
export function readRequestCookies(request: Request): string | undefined {
  const result = readRequestCookiesResult(request);
  return result.status === "ok" ? result.cookies : undefined;
}

/** Validate cookies from a request body (or other raw source). */
export function sanitizeUserCookies(content: unknown): string | undefined {
  if (typeof content !== "string" || !content.trim()) return undefined;
  const filtered = filterYoutubeCookies(content);
  return filtered.ok ? filtered.cookies : undefined;
}

/** Remove saved user cookies and the enable preference. */
export function clearUserCookies(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(COOKIES_KEY);
  localStorage.removeItem(CUSTOM_COOKIES_ENABLED_KEY);
  notifyCookiesChanged();
}
