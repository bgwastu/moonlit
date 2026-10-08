/** Convert an export into a header for www.youtube.com; never mix other domains. */
export function youtubeCookieHeader(content, now = Date.now()) {
  if (!content?.trim()) return "";
  const pairs = new Map();
  if (!content.includes("\t")) {
    for (const part of content.split(";")) {
      const index = part.indexOf("=");
      if (index < 1) continue;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (/^[\w!#$%&'*+.^`|~-]+$/.test(name) && !/[\x00-\x20\x7f-\uffff;]/.test(value))
        pairs.set(name, value);
    }
  } else {
    for (let line of content.split(/\r?\n/)) {
      line = line.trim();
      if (line.startsWith("#HttpOnly_")) line = line.slice(10);
      else if (line.startsWith("#")) continue;
      const [domain, _subdomains, cookiePath, _secure, expiration, name, value] =
        line.split("\t");
      const host = domain?.replace(/^\./, "").toLowerCase();
      if (
        !name ||
        value === undefined ||
        !["youtube.com", "www.youtube.com"].includes(host)
      )
        continue;
      if (cookiePath !== "/") continue;
      const expires = Number(expiration);
      if (!Number.isFinite(expires) || (expires > 0 && expires * 1000 <= now)) continue;
      if (/^[\w!#$%&'*+.^`|~-]+$/.test(name) && !/[\x00-\x20\x7f-\uffff;]/.test(value))
        pairs.set(name, value);
    }
  }
  return [...pairs].map(([name, value]) => `${name}=${value}`).join("; ");
}
