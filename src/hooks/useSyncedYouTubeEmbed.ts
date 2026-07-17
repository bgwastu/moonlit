"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Only hard-correct the iframe — soft seeks pause/buffer YouTube endlessly. */
const HARD_SEEK_S = 1.25;
const SEEK_COOLDOWN_MS = 900;
const YT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** YT.PlayerState */
const YT_UNSTARTED = -1;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_CUED = 5;

type YtPlayer = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  mute: () => void;
  setPlaybackRate: (rate: number) => void;
  getAvailablePlaybackRates: () => number[];
  getPlaybackRate: () => number;
  getIframe?: () => HTMLIFrameElement;
};

/** Block pointer events so hover chrome (title/share) is less likely to appear. */
function disableEmbedPointerEvents(player: YtPlayer, host: HTMLElement): void {
  host.style.pointerEvents = "none";
  try {
    const iframe = player.getIframe?.();
    if (!iframe) return;
    iframe.style.pointerEvents = "none";
    iframe.style.border = "0";
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("aria-hidden", "true");
  } catch {
    // ignore
  }
}

type YtNamespace = {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YtPlayer }) => void;
        onError?: (e: { data: number }) => void;
        onStateChange?: (e: { data: number }) => void;
      };
    },
  ) => YtPlayer;
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YtNamespace> | null = null;

function loadYouTubeApi(): Promise<YtNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("No window"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("YouTube IFrame API missing after ready"));
    };

    if (!document.querySelector("script[data-moonlit-yt-api]")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.moonlitYtApi = "1";
      script.onerror = () => {
        apiPromise = null;
        reject(new Error("Failed to load YouTube IFrame API"));
      };
      document.head.appendChild(script);
    }

    if (window.YT?.Player) resolve(window.YT);
  });

  return apiPromise;
}

function nearestYtRate(rate: number, available?: number[]): number {
  const list = available?.length ? available : [...YT_RATES];
  let best = list[0] ?? 1;
  let bestDiff = Math.abs(best - rate);
  for (const r of list) {
    const d = Math.abs(r - rate);
    if (d < bestDiff) {
      best = r;
      bestDiff = d;
    }
  }
  return best;
}

export interface UseSyncedYouTubeEmbedOptions {
  videoId: string | undefined;
  active: boolean;
  isPlaying: boolean;
  currentTime: number;
  rate: number;
}

export interface UseSyncedYouTubeEmbedResult {
  containerRef: (node: HTMLDivElement | null) => void;
  isVideoReady: boolean;
}

/**
 * Muted YouTube IFrame player locked to an external audio/stretch clock.
 * YouTube supports discrete playback rates (0.25–2); we map Moonlit rate to the nearest.
 */
export function useSyncedYouTubeEmbed({
  videoId,
  active,
  isPlaying,
  currentTime,
  rate,
}: UseSyncedYouTubeEmbedOptions): UseSyncedYouTubeEmbedResult {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const lastSeekAtRef = useRef(0);
  const lastRateRef = useRef<number | null>(null);
  const [nodeVersion, setNodeVersion] = useState(0);
  const [frameReady, setFrameReady] = useState(false);

  const activeRef = useRef(active);
  const playingRef = useRef(isPlaying);
  const timeRef = useRef(currentTime);
  const rateRef = useRef(rate);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    setNodeVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    activeRef.current = active;
    playingRef.current = isPlaying;
    timeRef.current = currentTime;
    rateRef.current = rate;
  });

  const applyPlayState = useCallback((player: YtPlayer) => {
    if (!activeRef.current) {
      if (player.getPlayerState() === YT_PLAYING) player.pauseVideo();
      return;
    }
    const state = player.getPlayerState();
    if (state === YT_BUFFERING) return;

    if (playingRef.current) {
      if (state !== YT_PLAYING) player.playVideo();
    } else if (state === YT_PLAYING || state === YT_BUFFERING) {
      player.pauseVideo();
    }
  }, []);

  const applyRate = useCallback((player: YtPlayer, nextRate: number) => {
    try {
      const target = nearestYtRate(nextRate, player.getAvailablePlaybackRates?.());
      if (lastRateRef.current !== null && Math.abs(lastRateRef.current - target) < 0.01) {
        return;
      }
      player.setPlaybackRate(target);
      lastRateRef.current = target;
    } catch {
      // Some embeds only allow rate 1
    }
  }, []);

  // Create / destroy player when videoId or host node changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!videoId || !host) {
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
      readyRef.current = false;
      lastRateRef.current = null;
      setFrameReady(false);
      return;
    }

    let cancelled = false;
    let player: YtPlayer | null = null;
    readyRef.current = false;
    lastRateRef.current = null;

    host.replaceChildren();
    const mount = document.createElement("div");
    mount.style.width = "100%";
    mount.style.height = "100%";
    host.appendChild(mount);

    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        player = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            // Muted autoplay is allowed; helps the first sync after ready.
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            cc_load_policy: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              playerRef.current = e.target;
              readyRef.current = true;
              e.target.mute();
              const hostEl = hostRef.current;
              if (hostEl) disableEmbedPointerEvents(e.target, hostEl);
              applyRate(e.target, rateRef.current);
              const t = Math.max(0, timeRef.current);
              if (t > 0.25) e.target.seekTo(t, true);
              setFrameReady(true);
              applyPlayState(e.target);
            },
            onStateChange: (e) => {
              if (cancelled || !readyRef.current) return;
              // After a seek YouTube often lands in PAUSED/CUED — nudge play if audio is playing.
              if (
                activeRef.current &&
                playingRef.current &&
                (e.data === YT_PAUSED || e.data === YT_CUED || e.data === YT_UNSTARTED)
              ) {
                try {
                  playerRef.current?.playVideo();
                } catch {
                  // ignore
                }
              }
              if (e.data === YT_PLAYING || e.data === YT_PAUSED) {
                setFrameReady(true);
              }
            },
            onError: () => {
              if (!cancelled) {
                readyRef.current = false;
                setFrameReady(false);
              }
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFrameReady(false);
      });

    return () => {
      cancelled = true;
      readyRef.current = false;
      try {
        player?.destroy();
      } catch {
        // ignore
      }
      if (playerRef.current === player) playerRef.current = null;
      host.replaceChildren();
      setFrameReady(false);
    };
  }, [videoId, nodeVersion, applyPlayState, applyRate]);

  // Deactivate: pause only.
  useEffect(() => {
    if (active) return;
    try {
      playerRef.current?.pauseVideo();
    } catch {
      // ignore
    }
  }, [active]);

  // Drive clock / rate / play from React state.
  // Important: do NOT seek on every soft drift — YT seekTo pauses and we loop forever.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current || !active || !videoId) return;

    try {
      player.mute();
      applyRate(player, rate);

      const state = player.getPlayerState();
      const now = Date.now();
      const canSeek =
        state !== YT_BUFFERING && now - lastSeekAtRef.current >= SEEK_COOLDOWN_MS;

      if (canSeek) {
        const ytTime = player.getCurrentTime?.() ?? 0;
        const drift = Math.abs(ytTime - currentTime);
        if (drift > HARD_SEEK_S) {
          lastSeekAtRef.current = now;
          player.seekTo(Math.max(0, currentTime), true);
          // playVideo is applied in onStateChange after seek settles
          if (isPlaying) player.playVideo();
          return;
        }
      }

      applyPlayState(player);
    } catch {
      // Player may be mid-destroy
    }
  }, [
    active,
    isPlaying,
    currentTime,
    rate,
    videoId,
    frameReady,
    applyPlayState,
    applyRate,
  ]);

  return {
    containerRef,
    isVideoReady: Boolean(videoId && frameReady),
  };
}
