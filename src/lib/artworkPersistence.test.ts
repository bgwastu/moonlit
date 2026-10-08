import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { HistoryItem } from "@/interfaces";
import { youtubeCoverUrl } from "./coverUrl";
import { loadHistoryFromStorage, saveHistoryToStorage } from "./historyStorage";
import { loadLastSession, saveLastSession } from "./lastSession";
import { peekSearchMeta, stashSearchMeta } from "./searchMeta";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const names = ["window", "localStorage", "sessionStorage"] as const;
const original = new Map(
  names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
beforeEach(() => {
  for (const name of names)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === "window" ? {} : new MemoryStorage(),
    });
});
afterEach(() => {
  for (const name of names) {
    const descriptor = original.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const item: HistoryItem = {
  sourceUrl: "https://www.youtube.com/watch?v=7WQqDRO70tA",
  fileUrl: "blob:cached-audio",
  playedAt: 100,
  metadata: {
    id: "7WQqDRO70tA",
    title: "DIGNITY (Live At Nippon Budokan, 2023)",
    author: "Ado",
    coverUrl: "blob:https://moonlit.wastu.net/expired-artwork",
  },
};

test("saved history repairs legacy artwork and preserves the song and play time", () => {
  localStorage.setItem("moonlit-history", JSON.stringify([item]));
  const restored = loadHistoryFromStorage();
  assert.equal(restored.length, 1);
  assert.equal(restored[0].metadata.coverUrl, youtubeCoverUrl(item.metadata.id));
  assert.equal(restored[0].playedAt, item.playedAt);
  assert.equal(restored[0].metadata.title, item.metadata.title);
  saveHistoryToStorage([item]);
  const stored = JSON.parse(localStorage.getItem("moonlit-history"));
  assert.equal(stored[0].metadata.coverUrl, youtubeCoverUrl(item.metadata.id));
});

test("last-session artwork survives reopening while keeping the resume position", () => {
  const session = {
    sourceUrl: item.sourceUrl,
    metadata: item.metadata,
    savedAt: Date.now(),
    mode: "mini" as const,
    positionSeconds: 121,
  };
  localStorage.setItem("moonlit-last-session", JSON.stringify(session));
  assert.equal(loadLastSession().metadata.coverUrl, youtubeCoverUrl(item.metadata.id));
  saveLastSession(session);
  const stored = JSON.parse(localStorage.getItem("moonlit-last-session"));
  assert.equal(stored.metadata.coverUrl, youtubeCoverUrl(item.metadata.id));
  assert.equal(stored.positionSeconds, 121);
});

test("session search metadata cannot restore or save an expired artwork object URL", () => {
  sessionStorage.setItem(
    `moonlit-search-meta:${item.metadata.id}`,
    JSON.stringify(item.metadata),
  );
  assert.equal(
    peekSearchMeta(item.metadata.id).coverUrl,
    youtubeCoverUrl(item.metadata.id),
  );
  stashSearchMeta(item.metadata.id, item.metadata);
  const stored = JSON.parse(
    sessionStorage.getItem(`moonlit-search-meta:${item.metadata.id}`),
  );
  assert.equal(stored.coverUrl, youtubeCoverUrl(item.metadata.id));
});
