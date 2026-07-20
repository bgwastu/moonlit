/** Preferred edge length for Google album-art CDN URLs. */
const GOOGLE_COVER_SIZE = 1200;

/** Prefer higher YT page thumbs; cover proxy falls back if maxres 404s. */
const YTIMG_VI_QUALITIES = [
  "maxresdefault",
  "sddefault",
  "hq720",
  "hqdefault",
  "mqdefault",
  "default",
] as const;

/** Any classic /vi/<id>/<name>.jpg page thumb — prefer album-art CDNs over these. */
const YTIMG_VI_PAGE_THUMB =
  /i\.ytimg\.com\/vi\/[^/?#]+\/(default|mqdefault|hqdefault|sddefault|hq720|maxresdefault)\.jpg/i;

/**
 * Rewrite known low-res cover URLs to a higher-quality variant.
 * Safe no-op for blobs, data URLs, and unrecognized hosts.
 */
export function upgradeCoverUrl(raw: string | undefined | null): string {
  if (!raw) return "";
  const url = raw.trim();
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return url;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "i.ytimg.com" || host.endsWith(".ytimg.com")) {
      return upgradeYtimgViUrl(parsed);
    }

    if (host.endsWith("googleusercontent.com") || host.endsWith("ggpht.com")) {
      return upgradeGoogleSizedUrl(parsed);
    }
  } catch {
    return url;
  }

  return url;
}

function upgradeYtimgViUrl(parsed: URL): string {
  // /vi/<id>/<quality>.jpg → prefer maxresdefault
  const match = parsed.pathname.match(
    /^\/vi\/([\w-]{11})\/(default|mqdefault|hqdefault|sddefault|hq720|maxresdefault)\.jpg$/i,
  );
  if (!match) return parsed.toString();
  const [, id, quality] = match;
  if (/^maxresdefault$/i.test(quality)) return parsed.toString();
  parsed.pathname = `/vi/${id}/maxresdefault.jpg`;
  return parsed.toString();
}

function upgradeGoogleSizedUrl(parsed: URL): string {
  // Path often ends with =w60-h60-l90-rj or =s88-c-k-...
  const path = parsed.pathname;
  const eq = path.lastIndexOf("=");
  if (eq < 0) return parsed.toString();

  const base = path.slice(0, eq + 1);
  let suffix = path.slice(eq + 1);

  let changed = false;
  suffix = suffix.replace(/w(\d+)/gi, (_m, n: string) => {
    const size = Number(n);
    if (size > 0 && size < GOOGLE_COVER_SIZE) {
      changed = true;
      return `w${GOOGLE_COVER_SIZE}`;
    }
    return _m;
  });
  suffix = suffix.replace(/h(\d+)/gi, (_m, n: string) => {
    const size = Number(n);
    if (size > 0 && size < GOOGLE_COVER_SIZE) {
      changed = true;
      return `h${GOOGLE_COVER_SIZE}`;
    }
    return _m;
  });
  suffix = suffix.replace(/(^|-)s(\d+)/gi, (_m, pre: string, n: string) => {
    const size = Number(n);
    if (size > 0 && size < GOOGLE_COVER_SIZE) {
      changed = true;
      return `${pre}s${GOOGLE_COVER_SIZE}`;
    }
    return _m;
  });

  if (!changed) return parsed.toString();
  parsed.pathname = base + suffix;
  return parsed.toString();
}

/** True for classic YouTube page thumbs (not album art CDNs). */
export function isWeakYtimgCoverUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // keep raw
  }
  return YTIMG_VI_PAGE_THUMB.test(decoded);
}

/**
 * Fallback chain for i.ytimg.com/vi/<id>/<quality>.jpg when the preferred
 * size is missing (maxres often 404s).
 */
export function ytimgViFallbackUrls(raw: string): string[] {
  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(
      /^\/vi\/([\w-]{11})\/(default|mqdefault|hqdefault|sddefault|hq720|maxresdefault)\.jpg$/i,
    );
    if (!match) return [raw];
    const [, id, current] = match;
    const start = YTIMG_VI_QUALITIES.findIndex(
      (q) => q.toLowerCase() === current.toLowerCase(),
    );
    const from = start >= 0 ? start : 0;
    return YTIMG_VI_QUALITIES.slice(from).map((quality) => {
      const next = new URL(parsed.toString());
      next.pathname = `/vi/${id}/${quality}.jpg`;
      return next.toString();
    });
  } catch {
    return [raw];
  }
}
