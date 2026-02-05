import { closeSync, existsSync, openSync, readSync } from "fs";
import path from "path";

const ID3_HEAD_SIZE = 128 * 1024;

/**
 * Read ID3 metadata from a local file (e.g. public/demo-1.mp3).
 * Only use for same-origin paths; pathname must be like "/demo-1.mp3" (no "..").
 * Returns null if file missing, not MP3, or parse fails.
 */
export function readId3FromPublicPath(pathname: string): {
  title?: string;
  artist?: string;
  album?: string;
} | null {
  if (!pathname.startsWith("/") || pathname.includes("..")) return null;
  const relative = pathname.slice(1);
  const filePath = path.join(process.cwd(), "public", relative);
  const publicDir = path.join(process.cwd(), "public");
  if (!path.resolve(filePath).startsWith(path.resolve(publicDir))) return null;
  if (!existsSync(filePath) || !/\.mp3$/i.test(pathname)) return null;

  try {
    const fd = openSync(filePath, "r");
    const buf = new Uint8Array(ID3_HEAD_SIZE);
    const bytesRead = readSync(fd, buf, 0, ID3_HEAD_SIZE, 0);
    closeSync(fd);
    const slice = buf.subarray(0, bytesRead);
    const parse = require("id3-parser").default;
    const tags = parse(slice);
    if (!tags || typeof tags !== "object") return null;
    const title = typeof tags.title === "string" ? tags.title.trim() : undefined;
    const artist = typeof tags.artist === "string" ? tags.artist.trim() : undefined;
    const album = typeof tags.album === "string" ? tags.album.trim() : undefined;
    if (!title && !artist && !album) return null;
    return { title, artist, album };
  } catch {
    return null;
  }
}
