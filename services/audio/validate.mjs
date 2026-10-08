import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AudioError } from "./errors.mjs";

const run = promisify(execFile);

async function validateMedia(kind, inputPath, outputPath, expectedDuration, signal) {
  signal.throwIfAborted();
  const options = { signal, timeout: 45000, maxBuffer: 256 * 1024 };
  const video = kind === "video";
  const map = video ? "0:v:0" : "0:a:0";
  try {
    const probe = await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,codec_type,width,height,pix_fmt:format=duration",
        "-of",
        "json",
        inputPath,
      ],
      options,
    );
    const info = JSON.parse(probe.stdout);
    const stream = info.streams?.find((stream) => stream.codec_type === kind);
    if (!stream) throw new Error(`Missing ${kind}`);
    if (
      video &&
      (stream.codec_name !== "h264" ||
        !stream.width ||
        !stream.height ||
        stream.height > 480 ||
        stream.pix_fmt !== "yuv420p")
    )
      throw new Error("Unsupported native video");
    await run(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-xerror",
        "-y",
        "-i",
        inputPath,
        "-map",
        map,
        video ? "-an" : "-vn",
        video ? "-c:v" : "-c:a",
        video || stream.codec_name === "aac" ? "copy" : "aac",
        "-movflags",
        "+faststart",
        "-f",
        video ? "mp4" : "ipod",
        outputPath,
      ],
      options,
    );
    const decoded = await run(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-xerror",
        "-i",
        outputPath,
        "-map",
        map,
        "-progress",
        "pipe:1",
        "-f",
        "null",
        "-",
      ],
      options,
    );
    const times = [...decoded.stdout.matchAll(/^out_time_us=(\d+)$/gm)];
    const duration = Number(times.at(-1)?.[1]) / 1e6;
    if (
      !duration ||
      Math.abs(duration - expectedDuration) > Math.max(1.5, expectedDuration * 0.015)
    )
      throw new Error(`Incomplete ${kind} duration`);
    return duration;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (video)
      throw new AudioError(
        "VIDEO_INCOMPLETE",
        "Video could not be prepared. You can keep listening with artwork.",
        {
          retryable: error.code !== "ENOENT",
          affectsHealth: false,
          status: error.code === "ENOENT" ? 503 : 502,
        },
      );
    if (error.code === "ENOENT")
      throw new AudioError(
        "AUDIO_CONFIGURATION",
        "The audio service requires ffmpeg and ffprobe.",
        { status: 503 },
      );
    throw new AudioError(
      "AUDIO_INCOMPLETE",
      "The audio download was incomplete. Please retry playback.",
      { retryable: true },
    );
  }
}

export function validateAudio(inputPath, outputPath, expectedDuration, signal) {
  return validateMedia("audio", inputPath, outputPath, expectedDuration, signal);
}

export function validateVideo(inputPath, outputPath, expectedDuration, signal) {
  return validateMedia("video", inputPath, outputPath, expectedDuration, signal);
}
