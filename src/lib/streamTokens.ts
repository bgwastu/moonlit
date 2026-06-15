export interface StreamToken {
  url: string;
  contentType: string;
  headers: Record<string, string>;
  sourceUrl: string;
  expiresAt: number;
}

export const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

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

export function pruneExpired(): void {
  const store = getStore();
  const now = Date.now();
  for (const [key, value] of store) {
    if (now > value.expiresAt) store.delete(key);
  }
}
