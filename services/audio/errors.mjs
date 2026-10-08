export class AudioError extends Error {
  constructor(
    code,
    message,
    { status = 502, retryable = false, affectsHealth = true } = {},
  ) {
    super(message);
    this.name = "AudioError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.affectsHealth = affectsHealth;
  }
}

export function classifyError(error) {
  if (error instanceof AudioError) return error;
  if (error?.name === "AbortError") {
    return new AudioError("CANCELLED", "Audio preparation was cancelled.", {
      status: 499,
      affectsHealth: false,
    });
  }
  const message = String(error?.message || error);
  if (/not a bot|stream.?protection|attestation required|no media parts/i.test(message)) {
    return new AudioError(
      "YOUTUBE_BLOCKED",
      "YouTube blocked playback on this connection. Please try again later.",
      { retryable: true },
    );
  }
  if (/status code 429|HTTP 429|Server returned 429/i.test(message)) {
    return new AudioError(
      "UPSTREAM_RATE_LIMITED",
      "YouTube is limiting playback requests. Please try again shortly.",
      { status: 503, retryable: true },
    );
  }
  if (/status code 400|HTTP 400|Server returned 400|invalid argument/i.test(message)) {
    return new AudioError(
      "YOUTUBE_CLIENT_ERROR",
      "YouTube rejected the playback request. The playback service needs to refresh its session.",
      { retryable: true },
    );
  }
  if (/status code 403|HTTP 403|Server returned 403/i.test(message)) {
    return new AudioError(
      "MEDIA_EXPIRED",
      "YouTube rejected the audio download. Please retry playback.",
      { retryable: true },
    );
  }
  if (
    /timeout|timed out|stalled|fetch failed|socket|ECONN|ENOTFOUND|network/i.test(
      message,
    ) ||
    error?.name === "TimeoutError"
  ) {
    return new AudioError(
      "YOUTUBE_UNAVAILABLE",
      "The audio service could not reach YouTube. Please try again shortly.",
      { status: 503, retryable: true },
    );
  }
  return new AudioError(
    "STREAM_UNAVAILABLE",
    "The audio service could not prepare this track.",
  );
}

export function checkPlayability(data, videoId) {
  const status = data.playabilityStatus?.status;
  const reason = data.playabilityStatus?.reason || "";
  if (status !== "OK") {
    if (/not a bot/i.test(reason)) throw classifyError(new Error(reason));
    if (/age|sign in|login/i.test(reason) || status === "LOGIN_REQUIRED") {
      throw new AudioError(
        "AUTH_REQUIRED",
        "This track requires a signed-in YouTube account. Enable your account cookies in settings.",
        { status: 403, affectsHealth: false },
      );
    }
    const knownRestriction =
      /private|removed|deleted|copyright|not available in your country|not available in your region/i.test(
        reason,
      );
    throw new AudioError(
      knownRestriction ? "CONTENT_UNAVAILABLE" : "YOUTUBE_ACCESS_DENIED",
      "YouTube does not make this track available on this connection. Try another upload.",
      { status: 422, affectsHealth: !knownRestriction, retryable: !knownRestriction },
    );
  }
  if (data.videoDetails?.videoId !== videoId) {
    throw new AudioError(
      "YOUTUBE_CLIENT_ERROR",
      "YouTube returned a different video for the playback request.",
      { retryable: true },
    );
  }
  if (data.videoDetails.isLiveContent && !data.videoDetails.lengthSeconds) {
    throw new AudioError(
      "LIVE_UNSUPPORTED",
      "Live audio cannot be processed yet. Choose a recorded track.",
      { status: 422, affectsHealth: false },
    );
  }
}

export function publicError(error) {
  const e = classifyError(error);
  return {
    code: e.code,
    error: e.message,
    status: e.status,
    retryable: e.retryable,
    affectsHealth: e.affectsHealth,
  };
}
