import { AudioError } from "./errors.mjs";

export function selectVideoFormat(formats, maxBytes, duration) {
  // H.264 MP4 plays natively on iOS as well as desktop. Avoid a costly transcode.
  const compatible = formats.filter(
    (format) =>
      /^video\/mp4\b/.test(format.mimeType || "") &&
      /avc1\./i.test(format.mimeType) &&
      format.height > 0 &&
      format.height <= 480,
  );
  if (!compatible.length)
    throw new AudioError(
      "VIDEO_UNAVAILABLE",
      "This track has no compatible video. You can keep listening with artwork.",
      {
        status: 422,
        affectsHealth: false,
      },
    );
  const bounded = compatible.filter((format) => {
    const estimated =
      format.contentLength ||
      ((format.averageBitrate || format.bitrate || 0) * duration) / 8;
    return estimated <= maxBytes;
  });
  if (!bounded.length)
    throw new AudioError(
      "VIDEO_TOO_LARGE",
      "This video is too large to cache. You can keep listening with artwork.",
      {
        status: 422,
        affectsHealth: false,
      },
    );
  return bounded.sort(
    (a, b) => b.height - a.height || (a.bitrate || 0) - (b.bitrate || 0),
  )[0];
}
