import { SabrStream } from "googlevideo/sabr-stream";
import { EnabledTrackTypes, Logger, buildSabrFormat } from "googlevideo/utils";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { Constants, Innertube, Log, Parser, Platform, Player } from "youtubei.js";
import { AudioError, checkPlayability, publicError } from "./errors.mjs";
import { createTokenMinter } from "./tokens.mjs";
import { watchPlayer } from "./watch.mjs";

const workerData = await new Promise((resolve) => process.once("message", resolve));
const parentPort = {
  postMessage: (message) => process.connected && process.send(message),
  on: (event, listener) => process.on(event, listener),
};

if (workerData.proxy) setGlobalDispatcher(new ProxyAgent(workerData.proxy));
Log.setLevel();
Logger.getInstance().setLogLevels();
Platform.shim.eval = async (data) => new Function(data.output)();
const nativeFetch = globalThis.fetch;
const fetchImpl = (input, init = {}) => {
  const inherited = init.signal || input?.signal;
  const headers = new Headers(init.headers || input?.headers);
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (
    workerData.cookies &&
    (url.hostname === "www.youtube.com" || url.hostname === "music.youtube.com")
  )
    headers.set("Cookie", workerData.cookies);
  return nativeFetch(input, {
    ...init,
    headers,
    signal: inherited
      ? AbortSignal.any([inherited, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
};
globalThis.fetch = fetchImpl;
let session;
let initializing;
const active = new Map();

async function getSession(refresh = false) {
  if (!refresh && session && Date.now() < session.expiresAt) return session;
  if (!initializing) {
    initializing = (async () => {
      const old = session;
      session = undefined;
      if (old) await old.close();
      const tokens = await createTokenMinter(fetchImpl);
      const yt = await Innertube.create({
        enable_session_cache: false,
        generate_session_locally: true,
        retrieve_innertube_config: false,
        player_id: tokens.playerId,
        fetch: fetchImpl,
        user_agent: tokens.userAgent,
        ...(workerData.cookies ? { cookie: workerData.cookies } : {}),
      });
      if (tokens.context?.client?.clientName === "WEB") {
        yt.session.context = structuredClone(tokens.context);
        yt.session.user_agent = tokens.context.client.userAgent || tokens.userAgent;
      }
      session = { yt, ...tokens };
      return session;
    })().finally(() => {
      initializing = undefined;
    });
  }
  return initializing;
}

async function playerRequest(yt, videoId, token, signal, reloadPlaybackContext) {
  if (workerData.cookies && !reloadPlaybackContext) {
    const result = await watchPlayer(fetchImpl, videoId, yt.session.user_agent, signal);
    if (result.playerId && result.playerId !== yt.session.player.player_id)
      yt.session.player = await Player.create(
        undefined,
        (input, init = {}) => fetchImpl(input, { ...init, signal }),
        undefined,
        result.playerId,
      );
    return { raw: result.raw, info: Parser.parseResponse(result.raw) };
  }
  const response = await yt.session.http.fetch("/player", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      videoId,
      client: "WEB",
      contentCheckOk: true,
      racyCheckOk: true,
      playbackContext: {
        contentPlaybackContext: {
          vis: 0,
          splay: false,
          lactMilliseconds: "-1",
          signatureTimestamp: yt.session.player?.signature_timestamp,
        },
        ...(reloadPlaybackContext ? { reloadPlaybackContext } : {}),
      },
      ...(workerData.cookies ? {} : { serviceIntegrityDimensions: { poToken: token } }),
    }),
  });
  const raw = await response.json();
  checkPlayability(raw, videoId);
  return { raw, info: Parser.parseResponse(raw) };
}

async function download(message, controller, refresh = false) {
  const progress = (data) =>
    parentPort.postMessage({ type: "progress", id: message.id, ...data });
  progress({ state: "resolving" });
  const { yt, minter } = await getSession(refresh);
  controller.signal.throwIfAborted();
  const token = await minter.mintAsWebsafeString(message.videoId);
  const { raw, info } = await playerRequest(
    yt,
    message.videoId,
    token,
    controller.signal,
  );
  const duration = Number(raw.videoDetails.lengthSeconds);
  if (!duration || duration > message.maxDuration)
    throw new AudioError(
      "TRACK_TOO_LONG",
      "This track is too long to process. Choose a shorter recording.",
      { status: 422, affectsHealth: false },
    );
  const abr = info.streaming_data?.server_abr_streaming_url;
  const config =
    info.player_config?.media_common_config?.media_ustreamer_request_config
      ?.video_playback_ustreamer_config;
  if (!abr || !config)
    throw new AudioError(
      "STREAM_UNAVAILABLE",
      "YouTube did not provide a supported audio stream.",
      { retryable: true },
    );
  const formats = info.streaming_data.adaptive_formats.map(buildSabrFormat);
  const preferred = formats.filter(
    (f) =>
      f.mimeType?.startsWith("audio/") && !f.isDrc && !f.isAutoDubbed && !f.isDescriptive,
  );
  const audio =
    preferred.find((f) => f.itag === 140) ||
    preferred.find((f) => f.mimeType.includes("mp4")) ||
    preferred[0];
  if (!audio)
    throw new AudioError(
      "STREAM_UNAVAILABLE",
      "YouTube did not provide an audio format.",
    );
  if (audio.contentLength > message.maxBytes)
    throw new AudioError("TRACK_TOO_LARGE", "This track is too large to process.", {
      status: 422,
      affectsHealth: false,
    });
  const sabr = new SabrStream({
    serverAbrStreamingUrl: await yt.session.player.decipher(abr),
    videoPlaybackUstreamerConfig: config,
    poToken: token,
    durationMs: duration * 1000,
    fetch: (input, init = {}) =>
      fetchImpl(input, {
        ...init,
        signal: AbortSignal.any([
          controller.signal,
          ...(init.signal ? [init.signal] : []),
        ]),
      }),
    formats,
    clientInfo: {
      clientName: Number(Constants.CLIENT_NAME_IDS.WEB),
      clientVersion: yt.session.context.client.clientVersion,
    },
  });
  const abort = () => sabr.abort();
  controller.signal.addEventListener("abort", abort, { once: true });
  let reloads = 0;
  let reloadFailure;
  sabr.on("reloadPlayerResponse", async (context) => {
    try {
      if (++reloads > 1)
        throw new AudioError(
          "YOUTUBE_BLOCKED",
          "YouTube repeatedly rejected this playback session.",
          { retryable: true },
        );
      const current = await getSession();
      const renewedToken = await current.minter.mintAsWebsafeString(message.videoId);
      const renewed = await playerRequest(
        current.yt,
        message.videoId,
        renewedToken,
        controller.signal,
        context,
      );
      sabr.setStreamingURL(
        await current.yt.session.player.decipher(
          renewed.info.streaming_data.server_abr_streaming_url,
        ),
      );
      sabr.setUstreamerConfig(
        renewed.info.player_config.media_common_config.media_ustreamer_request_config
          .video_playback_ustreamer_config,
      );
      sabr.setPoToken(renewedToken);
    } catch (error) {
      reloadFailure = error;
      sabr.abort();
    }
  });
  const output = createWriteStream(message.inputPath, { flags: "w", mode: 0o600 });
  const outputDone = finished(output);
  outputDone.catch(() => {});
  let bytes = 0;
  let lastUpdate = 0;
  try {
    const { audioStream } = await sabr.start({
      audioFormat: audio,
      preferMP4: true,
      enabledTrackTypes: EnabledTrackTypes.AUDIO_ONLY,
      maxRetries: 1,
      stallDetectionMs: 5000,
    });
    for await (const chunk of audioStream) {
      controller.signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > message.maxBytes)
        throw new AudioError("TRACK_TOO_LARGE", "This track is too large to process.", {
          status: 422,
          affectsHealth: false,
        });
      if (!output.write(chunk)) await once(output, "drain");
      if (Date.now() - lastUpdate > 250) {
        progress({
          state: "downloading",
          bytes,
          totalBytes: audio.contentLength || 0,
          percent: Math.min(
            95,
            audio.contentLength ? Math.round((bytes / audio.contentLength) * 95) : 0,
          ),
        });
        lastUpdate = Date.now();
      }
    }
    output.end();
    await outputDone;
    if (!bytes)
      throw new AudioError("STREAM_UNAVAILABLE", "YouTube returned empty audio.", {
        retryable: true,
      });
    const details = raw.videoDetails;
    const thumbs = details.thumbnail?.thumbnails || [];
    return {
      bytes,
      duration,
      mimeType: audio.mimeType,
      metadata: {
        title: details.title || "Unknown",
        author: details.author || "Unknown",
        artist: (details.author || "Unknown").replace(/ - Topic$/, ""),
        thumbnail:
          thumbs.at(-1)?.url || `https://i.ytimg.com/vi/${message.videoId}/hqdefault.jpg`,
        isAudioTrackVideo: / - Topic$/.test(details.author || ""),
      },
    };
  } catch (error) {
    output.destroy();
    await outputDone.catch(() => {});
    sabr.abort();
    throw reloadFailure || error;
  } finally {
    controller.signal.removeEventListener("abort", abort);
  }
}

parentPort.on("message", async (message) => {
  if (message.type === "cancel") {
    active.get(message.id)?.abort();
    return;
  }
  if (message.type !== "download") return;
  const controller = new AbortController();
  active.set(message.id, controller);
  try {
    let result;
    try {
      result = await download(message, controller);
    } catch (error) {
      const failure = publicError(error);
      if (!failure.retryable || controller.signal.aborted) throw error;
      parentPort.postMessage({
        type: "progress",
        id: message.id,
        state: "resolving",
        retrying: true,
        code: failure.code,
      });
      result = await download(message, controller, true);
    }
    parentPort.postMessage({ type: "ready", id: message.id, result });
  } catch (error) {
    parentPort.postMessage({
      type: "failed",
      id: message.id,
      error: publicError(controller.signal.aborted ? controller.signal.reason : error),
    });
  } finally {
    active.delete(message.id);
  }
});
parentPort.postMessage({ type: "initialized" });
process.once("disconnect", () => process.exit(0));
