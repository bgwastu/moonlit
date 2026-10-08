import assert from "node:assert/strict";
import { test } from "node:test";
import { createArtworkCache } from "./artworkCache";

class MemoryStore {
  values = new Map<string, unknown>();
  async getItem<T>(key: string): Promise<T | null> {
    return structuredClone((this.values.get(key) as T) ?? null);
  }
  async setItem<T>(key: string, value: T): Promise<T> {
    this.values.set(key, structuredClone(value));
    return value;
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
  async clear() {
    this.values.clear();
  }
  covers() {
    return [...this.values.values()].filter((value) => value instanceof Blob) as Blob[];
  }
}

const image = (size = 16) =>
  new Blob([new Uint8Array(size).fill(7)], { type: "image/png" });
const validate = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())[0] === 7;
const source = "https://www.youtube.com/watch?v=7WQqDRO70tA";
const thumbnail = "https://i.ytimg.com/vi/7WQqDRO70tA/maxresdefault.jpg";
const proxy = (url: string, id = "") =>
  `/api/cover?url=${encodeURIComponent(url)}${id ? `&v=${id}` : ""}`;

test("concurrent player, history and search loads share one fetch, including source aliases", async () => {
  const store = new MemoryStore();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Response(image());
  };
  const cache = createArtworkCache({ store, fetcher, validate });
  const blobs = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      cache.load(index % 2 ? source : "https://youtu.be/7WQqDRO70tA", proxy(thumbnail), {
        saved: index % 3 === 0,
      }),
    ),
  );
  assert(blobs.every((blob) => blob?.size === 16));
  assert.equal(calls, 1);
  assert.equal(store.covers().length, 1);
  // A new loader represents a new document: only the durable store survives.
  const reopened = createArtworkCache({ store, fetcher, validate });
  assert.equal(
    (
      await reopened.load(
        "https://music.youtube.com/watch?v=7WQqDRO70tA",
        proxy(`${thumbnail}?tracking=changed`, "7WQqDRO70tA"),
      )
    )?.size,
    16,
  );
  assert.equal(calls, 1);
});

test("previous cache format and repaired cover metadata are reused without a network request", async () => {
  const store = new MemoryStore();
  const oldKey = `${source}\n${proxy(`${thumbnail}?old=1`)}`;
  await store.setItem(oldKey, image());
  await store.setItem("__moonlit-cover-cache-meta__", { order: [oldKey] });
  let calls = 0;
  const cache = createArtworkCache({
    store,
    validate,
    fetcher: async () => {
      calls++;
      throw new Error("Offline");
    },
  });
  assert.equal(
    (await cache.load("7WQqDRO70tA", proxy(thumbnail, "7WQqDRO70tA"), { saved: true }))
      ?.size,
    16,
  );
  assert.equal(
    (await cache.load(source, proxy("https://i.ytimg.com/vi/7WQqDRO70tA/hqdefault.jpg")))
      ?.size,
    16,
  );
  assert.equal(calls, 0);
  assert.equal(store.covers().length, 1);
});

test("a better album image replaces a thumbnail once, without refetching for later metadata changes", async () => {
  const store = new MemoryStore();
  const calls: string[] = [];
  const cache = createArtworkCache({
    store,
    validate,
    fetcher: async (url) => {
      calls.push(url);
      return new Response(image(url.includes("googleusercontent") ? 32 : 16));
    },
  });
  assert.equal((await cache.load(source, proxy(thumbnail)))?.size, 16);
  assert.equal(
    (
      await cache.load(
        source,
        proxy("https://lh3.googleusercontent.com/album=w60-h60", "7WQqDRO70tA"),
      )
    )?.size,
    32,
  );
  assert.equal(
    (
      await cache.load(
        source,
        proxy(
          "https://lh3.googleusercontent.com/changed-metadata=w1200-h1200",
          "7WQqDRO70tA",
        ),
      )
    )?.size,
    32,
  );
  assert.equal((await cache.load(source, proxy(thumbnail)))?.size, 32);
  assert.equal(calls.length, 2);
  assert.equal(store.covers().length, 1);
});

test("all fifty recent-song covers survive concurrent writes and search cache churn", async () => {
  const store = new MemoryStore();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Response(image());
  };
  const cache = createArtworkCache({ store, validate, fetcher });
  const id = (index: number) => String(index).padStart(11, "a");
  const load = (index: number, saved: boolean) =>
    cache.load(
      id(index),
      proxy(`https://i.ytimg.com/vi/${id(index)}/maxresdefault.jpg`),
      { saved },
    );
  await Promise.all(Array.from({ length: 50 }, (_, index) => load(index, true)));
  await Promise.all(Array.from({ length: 110 }, (_, index) => load(index + 50, false)));
  assert.equal(store.covers().length, 100);
  const before = calls;
  await Promise.all(Array.from({ length: 50 }, (_, index) => load(index, true)));
  assert.equal(calls, before);
  const meta = await store.getItem<{ order: string[]; savedTracks: string[] }>(
    "__moonlit-cover-cache-meta__",
  );
  assert.equal(meta.order.length, 100);
  assert.equal(new Set(meta.order).size, 100);
  assert.equal(meta.savedTracks.length, 50);
});

test("the byte budget evicts search thumbnails first and never stores oversized images", async () => {
  const store = new MemoryStore();
  let calls = 0;
  const cache = createArtworkCache({
    store,
    validate,
    maxBytes: 40,
    fetcher: async (url) => {
      calls++;
      return new Response(image(url.includes("oversized") ? 100 : 16));
    },
  });
  await cache.load("saved", "/saved", { saved: true });
  await cache.load("search-a", "/search-a");
  await cache.load("search-b", "/search-b");
  assert.equal(store.covers().length, 2);
  assert.equal((await cache.load("saved", "/saved", { saved: true }))?.size, 16);
  assert.equal(calls, 3);
  assert.equal((await cache.load("oversized", "/oversized"))?.size, 100);
  assert.equal(store.covers().length, 2);
  assert(store.covers().reduce((total, blob) => total + blob.size, 0) <= 40);
  await cache.load("saved-next", "/saved-next", { saved: true });
  await cache.load("saved-newest", "/saved-newest", { saved: true });
  const before = calls;
  await cache.load("saved-next", "/saved-next", { saved: true });
  await cache.load("saved-newest", "/saved-newest", { saved: true });
  assert.equal(
    calls,
    before,
    "The newest saved covers must remain cached when the byte budget is full",
  );
});

test("corrupt artwork is discarded and failures do not cause a request storm or a permanent miss", async () => {
  const store = new MemoryStore();
  let time = 100_000;
  let calls = 0;
  const cache = createArtworkCache({
    store,
    validate,
    now: () => time,
    fetcher: async () => {
      calls++;
      return calls === 1
        ? new Response("corrupt", { headers: { "Content-Type": "image/png" } })
        : new Response(image());
    },
  });
  assert.equal(await cache.load(source, proxy(thumbnail)), null);
  assert.equal(await cache.load(source, proxy(thumbnail)), null);
  assert.equal(calls, 1);
  assert.equal(store.covers().length, 0);
  time += 30_001;
  assert.equal((await cache.load(source, proxy(thumbnail)))?.size, 16);
  assert.equal(calls, 2);
  const meta = await store.getItem<{ order: string[] }>("__moonlit-cover-cache-meta__");
  await store.setItem(
    meta.order[0],
    new Blob(["corrupt old artwork"], { type: "image/png" }),
  );
  assert.equal((await cache.load(source, proxy(thumbnail)))?.size, 16);
  assert.equal(calls, 3);
  assert.equal(store.covers().length, 1);
});

test("clearing artwork cancels pending downloads and prevents them from repopulating storage", async () => {
  const store = new MemoryStore();
  let release: (response: Response) => void;
  let started: () => void;
  const downloading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const cache = createArtworkCache({
    store,
    validate,
    fetcher: async () => {
      started();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    },
  });
  const pending = cache.load(source, proxy(thumbnail));
  await downloading;
  await cache.clear();
  release(new Response(image()));
  assert.equal(await pending, null);
  assert.equal(store.values.size, 0);
});

test("unavailable device storage still displays a validated image and shares the download", async () => {
  const store = new MemoryStore();
  store.getItem = async () => {
    throw new Error("Storage unavailable");
  };
  let calls = 0;
  const cache = createArtworkCache({
    store,
    validate,
    fetcher: async () => {
      calls++;
      return new Response(image());
    },
  });
  const blobs = await Promise.all([
    cache.load(source, proxy(thumbnail)),
    cache.load(source, proxy(thumbnail)),
  ]);
  assert(blobs.every((blob) => blob?.size === 16));
  assert.equal(calls, 1);
});

test("embedded artwork from a local upload survives revoking its original object URL", async () => {
  const store = new MemoryStore();
  const cache = createArtworkCache({ store, validate });
  const localCover = URL.createObjectURL(image());
  try {
    assert.equal(
      (await cache.load("local:uploaded-song", localCover, { saved: true }))?.size,
      16,
    );
  } finally {
    URL.revokeObjectURL(localCover);
  }
  const reopened = createArtworkCache({
    store,
    validate,
    fetcher: async () => {
      throw new Error("No remote artwork for a local upload");
    },
  });
  assert.equal((await reopened.load("local:uploaded-song", ""))?.size, 16);
});

test("local mode reuses artwork without attempting remote downloads or album upgrades", async () => {
  const store = new MemoryStore();
  let calls = 0;
  const cache = createArtworkCache({
    store,
    validate,
    fetcher: async () => {
      calls++;
      return new Response(image());
    },
  });
  assert.equal(await cache.load(source, proxy(thumbnail), { cacheOnly: true }), null);
  assert.equal(calls, 0);
  await cache.load(source, proxy(thumbnail), { saved: true });
  assert.equal(
    (
      await cache.load(
        source,
        proxy("https://lh3.googleusercontent.com/album=w1200-h1200"),
        { cacheOnly: true },
      )
    )?.size,
    16,
  );
  assert.equal(calls, 1);
});
