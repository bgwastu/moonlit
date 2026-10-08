// Adapted from the MIT-licensed googlevideo webpo-helper example:
// https://github.com/LuanRT/googlevideo/blob/main/examples/downloader/utils/webpo-helper.ts
import { BotGuardClient } from "bgutils-js/botguard";
import { USER_AGENT, buildURL, getHeaders, parseLooseJSON } from "bgutils-js/utils";
import { WebPoMinter } from "bgutils-js/webpo";
import { JSDOM, VirtualConsole } from "jsdom";
import { AudioError } from "./errors.mjs";

const WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export async function createTokenMinter(fetchImpl) {
  const response = await fetchImpl("https://www.youtube.com/", {
    headers: { "accept-language": "en-US,en;q=0.9", "user-agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const config = html.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
  const attestation = html.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/)?.[1];
  if (!config || !attestation) {
    throw new AudioError(
      "YOUTUBE_CLIENT_ERROR",
      "YouTube's playback challenge could not be initialized.",
      { retryable: true },
    );
  }
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://www.youtube.com/",
    referrer: "https://www.youtube.com/",
    userAgent: USER_AGENT,
    virtualConsole: new VirtualConsole(),
  });
  const youtubeConfig = JSON.parse(config);
  dom.window.yt = { config_: youtubeConfig };
  dom.window.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (kind !== "2d") return null;
    return {
      fillRect() {},
      clearRect() {},
      putImageData() {},
      setTransform() {},
      drawImage() {},
      save() {},
      fillText() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      stroke() {},
      translate() {},
      scale() {},
      rotate() {},
      arc() {},
      fill() {},
      transform() {},
      rect() {},
      clip() {},
      createImageData() {
        return [];
      },
      measureText() {
        return { width: 0 };
      },
      getImageData(_x, _y, w, h) {
        return { data: new Uint8ClampedArray(w * h * 4) };
      },
    };
  };
  Object.assign(globalThis, {
    yt: dom.window.yt,
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    origin: dom.window.origin,
  });
  if (!("navigator" in globalThis))
    Object.defineProperty(globalThis, "navigator", {
      value: dom.window.navigator,
      configurable: true,
    });
  const challenge = parseLooseJSON(attestation).R?.bgChallenge;
  if (!challenge?.program)
    throw new AudioError(
      "YOUTUBE_CLIENT_ERROR",
      "YouTube did not provide a playback challenge.",
      { retryable: true },
    );
  const interpreter =
    challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  const scriptUrl = new URL(interpreter, "https://www.youtube.com/");
  if (
    scriptUrl.protocol !== "https:" ||
    !(
      scriptUrl.hostname === "google.com" ||
      scriptUrl.hostname.endsWith(".google.com") ||
      scriptUrl.hostname.endsWith(".gstatic.com")
    )
  ) {
    throw new AudioError(
      "YOUTUBE_CLIENT_ERROR",
      "YouTube returned an unexpected challenge interpreter.",
    );
  }
  const scriptResponse = await fetchImpl(scriptUrl);
  if (!scriptResponse.ok) throw new Error(`HTTP ${scriptResponse.status}`);
  new Function(await scriptResponse.text())();
  const botguard = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  });
  const signals = [];
  const snapshot = await botguard.snapshot({ webPoSignalOutput: signals });
  const integrity = await fetchImpl(buildURL("GenerateIT", true), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(["O43z0dpjhgX20SCx4KAo", snapshot]),
  });
  if (!integrity.ok) throw new Error(`HTTP ${integrity.status}`);
  const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] =
    await integrity.json();
  const minter = await WebPoMinter.create(
    { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken },
    signals,
  );
  const ttl = Number(estimatedTtlSecs) > 0 ? Number(estimatedTtlSecs) : 900;
  return {
    minter,
    context: youtubeConfig.INNERTUBE_CONTEXT,
    playerId: youtubeConfig.PLAYER_JS_URL?.match(/\/s\/player\/([^/]+)\//)?.[1],
    userAgent: WEB_USER_AGENT,
    expiresAt: Date.now() + Math.max(30, Math.min(ttl * 0.8, 3600)) * 1000,
    close: async () => {
      await botguard.shutdown(1000).catch(() => {});
      dom.window.close();
    },
  };
}
