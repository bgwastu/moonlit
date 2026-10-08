import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AudioError } from "./errors.mjs";

const run = promisify(execFile);

export async function validateAudio(inputPath, outputPath, expectedDuration, signal) {
  signal.throwIfAborted();
  const options = { signal, timeout: 45000, maxBuffer: 256 * 1024 };
  try {
    const probe = await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,codec_type,sample_rate,channels:format=duration",
        "-of",
        "json",
        inputPath,
      ],
      options,
    );
    const info = JSON.parse(probe.stdout);
    const audio = info.streams?.find((s) => s.codec_type === "audio");
    if (!audio) throw new Error("Missing audio");
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
        "0:a:0",
        "-vn",
        "-c:a",
        audio.codec_name === "aac" ? "copy" : "aac",
        "-movflags",
        "+faststart",
        "-f",
        "ipod",
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
        "0:a:0",
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
      throw new Error("Incomplete audio duration");
    return duration;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
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
