import crypto from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export interface StreamToken {
  url: string;
  contentType: string;
  headers: Record<string, string>;
  sourceUrl: string;
  expiresAt: number;
}

export const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

const tokenRuntime = globalThis as typeof globalThis & {
  __moonlitStreamTokenSecret?: string;
};

function getTokenSecret(): string {
  if (process.env.MOONLIT_STREAM_TOKEN_SECRET) {
    return process.env.MOONLIT_STREAM_TOKEN_SECRET;
  }
  if (tokenRuntime.__moonlitStreamTokenSecret) {
    return tokenRuntime.__moonlitStreamTokenSecret;
  }

  const secretPath = path.join(process.cwd(), "data", ".stream-token-secret");
  try {
    const saved = readFileSync(secretPath, "utf8").trim();
    if (saved) {
      tokenRuntime.__moonlitStreamTokenSecret = saved;
      return saved;
    }
  } catch {
    // Generate and persist the secret below on first startup.
  }

  let generated = crypto.randomBytes(32).toString("hex");
  try {
    mkdirSync(path.dirname(secretPath), { recursive: true });
    writeFileSync(secretPath, generated, { encoding: "utf8", flag: "wx" });
  } catch {
    try {
      generated = readFileSync(secretPath, "utf8").trim() || generated;
    } catch {
      // The process secret remains valid when persistent storage is unavailable.
    }
  }
  tokenRuntime.__moonlitStreamTokenSecret = generated;
  return generated;
}

const TOKEN_SECRET = getTokenSecret();

const tokenStore = globalThis as typeof globalThis & {
  __moonlitStreamTokens?: Map<string, StreamToken>;
};

function getStore(): Map<string, StreamToken> {
  if (!tokenStore.__moonlitStreamTokens) {
    tokenStore.__moonlitStreamTokens = new Map();
  }
  return tokenStore.__moonlitStreamTokens;
}

export function getTokenStore(): Map<string, StreamToken> {
  return getStore();
}

function encodePayload(entry: StreamToken): string {
  return Buffer.from(JSON.stringify(entry)).toString("base64url");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
}

/** Create a signed token so a stream survives separate Next route runtimes. */
export function createStreamToken(entry: StreamToken): string {
  const payload = encodePayload(entry);
  const token = `${payload}.${sign(payload)}`;
  getStore().set(token, entry);
  return token;
}

/** Read from memory first, then recover a valid signed token without the map. */
export function getStreamToken(token: string): StreamToken | undefined {
  const stored = getStore().get(token);
  if (stored) return stored;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return undefined;

  try {
    const entry = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as StreamToken;
    if (!entry.url || !entry.expiresAt || Date.now() > entry.expiresAt) return undefined;
    getStore().set(token, entry);
    return entry;
  } catch {
    return undefined;
  }
}

export function pruneExpired(): void {
  const store = getStore();
  const now = Date.now();
  for (const [key, value] of store) {
    if (now > value.expiresAt) store.delete(key);
  }
}
