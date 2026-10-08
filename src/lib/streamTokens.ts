import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type StreamToken = { assetId: string; expiresAt: number };
export const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

const runtime = globalThis as typeof globalThis & { __moonlitStreamTokenSecret?: string };
function getTokenSecret() {
  if (process.env.MOONLIT_STREAM_TOKEN_SECRET)
    return process.env.MOONLIT_STREAM_TOKEN_SECRET;
  if (runtime.__moonlitStreamTokenSecret) return runtime.__moonlitStreamTokenSecret;
  const file = path.join(process.cwd(), "data", ".stream-token-secret");
  try {
    const saved = readFileSync(file, "utf8").trim();
    if (saved) return (runtime.__moonlitStreamTokenSecret = saved);
  } catch {}
  let generated = randomBytes(32).toString("hex");
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, generated, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch {
    try {
      generated = readFileSync(file, "utf8").trim() || generated;
    } catch {}
  }
  return (runtime.__moonlitStreamTokenSecret = generated);
}

function sign(payload: string) {
  return createHmac("sha256", getTokenSecret()).update(payload).digest("base64url");
}

/** Stateless asset tokens retain the existing signing key across releases. */
export function createStreamToken(entry: StreamToken) {
  const payload = Buffer.from(JSON.stringify(entry)).toString("base64url");
  return payload + "." + sign(payload);
}

export function getStreamToken(token: string): StreamToken | undefined {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return;
  const [payload, signature] = token.split(".");
  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return;
  try {
    const entry = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      /^[a-f0-9]{32}$/.test(entry.assetId || "") &&
      Number.isFinite(entry.expiresAt) &&
      entry.expiresAt > Date.now()
    )
      return entry;
  } catch {}
}
