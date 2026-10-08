import assert from "node:assert/strict";
import test from "node:test";
import { embeddedObject, watchPlayer } from "../watch.mjs";

test("watch metadata handles quoted braces and escapes without evaluating scripts", () => {
  const data = { videoDetails: { title: 'a } brace, \\"quote\\" and { brace' } };
  const html = `var ytInitialPlayerResponse = ${JSON.stringify(data)}; throw new Error('never execute');`;
  assert.deepEqual(embeddedObject(html, ["var ytInitialPlayerResponse ="]), data);
  for (const invalid of [
    "<html>consent page</html>",
    'var ytInitialPlayerResponse = {"a":',
  ])
    assert.throws(
      () => embeddedObject(invalid, ["var ytInitialPlayerResponse ="]),
      (error) => error.code === "YOUTUBE_CLIENT_ERROR" && error.retryable,
    );
});

test("watch extraction rejects unrelated videos and recognizes player versions", async () => {
  const data = {
    playabilityStatus: { status: "OK" },
    videoDetails: { videoId: "aaaaaaaaaaa", lengthSeconds: "60" },
  };
  const html = `var ytInitialPlayerResponse = ${JSON.stringify(data)}; var config = {"PLAYER_JS_URL":"/s/player/abcd1234/player_ias.vflset/en_US/base.js"};`;
  const fetchImpl = async () => new Response(html);
  const parsed = await watchPlayer(fetchImpl, "aaaaaaaaaaa", "test-agent");
  assert.equal(parsed.playerId, "abcd1234");
  assert.deepEqual(parsed.raw, data);
  await assert.rejects(
    watchPlayer(fetchImpl, "bbbbbbbbbbb", "test-agent"),
    (error) => error.code === "YOUTUBE_CLIENT_ERROR",
  );
});
