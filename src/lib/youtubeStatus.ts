export const YOUTUBE_STATUS_CHANGED_EVENT = "moonlit:youtube-status-changed";

export type YouTubeStatus = {
  state: "healthy" | "degraded" | "offline" | "unknown";
  online: boolean;
  expiresAt: number;
  retryAfterMs?: number;
  searchOk?: boolean;
  extractOk?: boolean;
  cookieSource?: "none" | "user" | "system";
  capabilities?: {
    search: { state: "healthy" | "degraded" | "unknown" };
    playback: { state: "healthy" | "degraded" | "unknown" };
  };
  error?: string;
  code?: string;
  lastItemError?: { error: string };
};

export const unknownYouTubeStatus = (): YouTubeStatus => ({
  state: "unknown",
  online: false,
  expiresAt: 0,
});

export type YouTubeAvailability = {
  status: YouTubeStatus;
  connectionOnline: boolean;
  localOnly: boolean;
  checking: boolean;
};

export const initialYouTubeAvailability: YouTubeAvailability = {
  status: unknownYouTubeStatus(),
  connectionOnline: true,
  localOnly: false,
  checking: true,
};

type AvailabilityAction =
  | { type: "status"; status: YouTubeStatus; now: number }
  | { type: "connection"; online: boolean }
  | { type: "checking" }
  | { type: "expired" }
  | { type: "unreachable"; confirmed: boolean };

/** An unknown result keeps YouTube off until a fresh check confirms it is back. */
export function youtubeAvailabilityReducer(
  state: YouTubeAvailability,
  action: AvailabilityAction,
): YouTubeAvailability {
  if (action.type === "checking") return { ...state, checking: true };
  if (action.type === "expired") return { ...state, status: unknownYouTubeStatus() };
  if (action.type === "connection") {
    if (action.online)
      return { ...state, connectionOnline: true, status: unknownYouTubeStatus() };
    return {
      ...state,
      connectionOnline: false,
      localOnly: true,
      checking: false,
    };
  }
  if (action.type === "unreachable") {
    return {
      ...state,
      status: {
        ...unknownYouTubeStatus(),
        error: "Could not reach the online music service.",
      },
      checking: false,
      localOnly: state.localOnly || action.confirmed,
    };
  }
  const status =
    action.status.expiresAt > action.now ? action.status : unknownYouTubeStatus();
  const unavailable =
    status.state === "offline" ||
    status.state === "degraded" ||
    status.capabilities?.playback?.state === "degraded" ||
    status.capabilities?.search?.state === "degraded";
  const recovered = state.connectionOnline && status.state === "healthy" && !unavailable;
  const localOnly =
    !state.connectionOnline || unavailable || (state.localOnly && !recovered);
  return {
    ...state,
    status,
    localOnly,
    checking: false,
  };
}
