import assert from "node:assert/strict";
import test from "node:test";
import { coverFallbackUrls, durableCoverUrl, youtubeCoverUrl } from "./coverUrl";
import { toDisplayCoverUrl } from "./mergePlayerMedia";

const id = "7WQqDRO70tA";

test("expired object URLs recover to durable track artwork without changing valid artwork", () => {
  assert.equal(
    durableCoverUrl("blob:https://moonlit.wastu.net/expired", id),
    youtubeCoverUrl(id),
  );
  assert.equal(durableCoverUrl("blob:https://moonlit.wastu.net/expired", null), "");
  assert.equal(
    durableCoverUrl("data:image/png;base64,artwork", id),
    "data:image/png;base64,artwork",
  );
  assert.equal(youtubeCoverUrl("../../invalid"), "");
});

test("album covers carry a video recovery id and fall back to public track thumbnails", () => {
  const album = "https://lh3.googleusercontent.com/expired-album=w60-h60";
  const display = new URL(toDisplayCoverUrl(album, id), "https://moonlit.wastu.net");
  assert.equal(display.searchParams.get("v"), id);
  assert.equal(
    display.searchParams.get("url"),
    "https://lh3.googleusercontent.com/expired-album=w1200-h1200",
  );
  const candidates = coverFallbackUrls(album, id);
  assert.equal(candidates[0], display.searchParams.get("url"));
  assert(candidates.includes(album));
  assert(candidates.includes(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`));
  assert.equal(new Set(candidates).size, candidates.length);
});

test("old proxied covers gain recovery information without nesting the proxy", () => {
  const album = `/api/cover?url=${encodeURIComponent("https://lh3.googleusercontent.com/album=w1200-h1200")}`;
  const normalized = toDisplayCoverUrl(album, id);
  assert.equal(toDisplayCoverUrl(normalized, id), normalized);
  assert.equal(
    new URL(normalized, "https://moonlit.wastu.net").searchParams.get("v"),
    id,
  );
  assert(
    !toDisplayCoverUrl(`blob:https://moonlit.wastu.net/expired`, id).includes("blob"),
  );
  assert.equal(toDisplayCoverUrl("blob:local-upload", null), "blob:local-upload");
});
