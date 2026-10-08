import assert from "node:assert/strict";
import { test } from "node:test";
import { loadHistoryFromStorage, saveHistoryToStorage } from "./historyStorage";
import { mergePlayerMedia } from "./mergePlayerMedia";
import { historyItemSourceUrl } from "./playFromCache";
import {
  type YouTubeAvailability,
  type YouTubeStatus,
  initialYouTubeAvailability,
  youtubeAvailabilityReducer,
} from "./youtubeStatus";

const healthy: YouTubeStatus = {
  state: "healthy",
  online: true,
  expiresAt: 2000,
  capabilities: { search: { state: "healthy" }, playback: { state: "healthy" } },
};
const offline: YouTubeStatus = { state: "offline", online: false, expiresAt: 2000 };
const receive = (
  status: YouTubeStatus,
  state: YouTubeAvailability = initialYouTubeAvailability,
) => youtubeAvailabilityReducer(state, { type: "status", status, now: 1000 });

test("a verified outage automatically enters local mode and opens its modal", () => {
  const state = receive(offline, receive(healthy));
  assert.equal(state.localOnly, true);
  assert.equal(state.modalOpened, true);
});

test("working search with unavailable playback still activates local mode", () => {
  const state = receive({
    ...healthy,
    state: "degraded",
    capabilities: { search: { state: "healthy" }, playback: { state: "degraded" } },
  });
  assert.equal(state.localOnly, true);
  assert.equal(state.modalOpened, true);
});

test("dismissing the modal persists through checks, expiry and the same outage", () => {
  let state = youtubeAvailabilityReducer(receive(offline), { type: "dismiss" });
  state = receive(offline, state);
  state = youtubeAvailabilityReducer(state, { type: "expired" });
  state = receive({ ...healthy, state: "unknown" }, state);
  assert.equal(state.localOnly, true);
  assert.equal(state.modalOpened, false);
});

test("fresh successful verification restores online controls and closes the modal", () => {
  const state = receive(healthy, receive(offline));
  assert.equal(state.localOnly, false);
  assert.equal(state.modalOpened, false);
  assert.equal(receive(offline, state).modalOpened, true);
});

test("expired healthy status cannot restore search or override an offline connection", () => {
  const local = receive(offline);
  const expired = receive({ ...healthy, expiresAt: 900 }, local);
  assert.equal(expired.localOnly, true);
  assert.equal(expired.status.state, "unknown");
  assert.equal(
    receive(
      healthy,
      youtubeAvailabilityReducer(local, { type: "connection", online: false }),
    ).localOnly,
    true,
  );
});

test("reconnecting waits for real availability instead of treating the browser hint as recovery", () => {
  const disconnected = youtubeAvailabilityReducer(receive(healthy), {
    type: "connection",
    online: false,
  });
  const reconnected = youtubeAvailabilityReducer(disconnected, {
    type: "connection",
    online: true,
  });
  assert.equal(reconnected.localOnly, true);
  assert.equal(reconnected.status.state, "unknown");
  assert.equal(receive(healthy, reconnected).localOnly, false);
});

test("a single unknown check or item restriction is not a service outage", () => {
  assert.equal(
    youtubeAvailabilityReducer(receive(healthy), {
      type: "unreachable",
      confirmed: false,
    }).localOnly,
    false,
  );
  assert.equal(
    receive({ ...healthy, lastItemError: { error: "This private video is unavailable" } })
      .localOnly,
    false,
  );
  assert.equal(
    youtubeAvailabilityReducer(receive(healthy), { type: "unreachable", confirmed: true })
      .modalOpened,
    true,
  );
});

test("local imports never become YouTube URLs when replayed from history", () => {
  const item = {
    sourceUrl: "local:local-123:video",
    fileUrl: "blob:old-audio",
    playedAt: 1,
    metadata: { id: "local-123", title: "My song", author: "Local file", coverUrl: "" },
  };
  assert.equal(historyItemSourceUrl(item), null);
  assert.equal(
    historyItemSourceUrl({
      ...item,
      sourceUrl: "",
      metadata: { ...item.metadata, id: "7WQqDRO70tA" },
    }),
    "https://www.youtube.com/watch?v=7WQqDRO70tA",
  );
});

test("local music survives a history round trip without persisting document artwork URLs", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const item = {
      sourceUrl: "local:local-123:video",
      fileUrl: "blob:expired-audio",
      playedAt: 1,
      metadata: {
        id: "local-123",
        title: "My song",
        author: "Local file",
        coverUrl: "blob:expired-artwork",
      },
    };
    saveHistoryToStorage([item]);
    const [saved] = loadHistoryFromStorage();
    assert.equal(saved.sourceUrl, item.sourceUrl);
    assert.equal(saved.metadata.title, "My song");
    assert.equal(saved.metadata.coverUrl, "");
    assert.equal(historyItemSourceUrl(saved), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("opening a local file cannot inherit the previous YouTube song's artist or artwork", () => {
  const local = {
    sourceUrl: "local:local-123:video",
    fileUrl: "blob:new-audio",
    metadata: { id: "local-123", title: "My song", author: "Local file", coverUrl: "" },
  };
  const media = mergePlayerMedia({
    contextMedia: local,
    extractedMedia: {
      sourceUrl: "https://www.youtube.com/watch?v=7WQqDRO70tA",
      fileUrl: "blob:previous-audio",
      metadata: {
        id: "7WQqDRO70tA",
        title: "DIGNITY",
        author: "Ado",
        artist: "Ado",
        coverUrl: "https://i.ytimg.com/vi/7WQqDRO70tA/maxresdefault.jpg",
      },
    },
    provisionalMedia: null,
  });
  assert.equal(media?.sourceUrl, local.sourceUrl);
  assert.equal(media?.fileUrl, local.fileUrl);
  assert.equal(media?.metadata.author, "Local file");
  assert.equal(media?.metadata.artist, undefined);
  assert.equal(media?.metadata.coverUrl, "");
});
