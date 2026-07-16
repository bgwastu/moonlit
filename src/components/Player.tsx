"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiYoutube, SiYoutubemusic } from "@icons-pack/react-simple-icons";
import { generateColors } from "@mantine/colors-generator";
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Flex,
  Image,
  Loader,
  MantineProvider,
  Menu,
  Progress,
  SegmentedControl,
  Slider,
  Text,
  Transition,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useHotkeys, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustments,
  IconChevronDown,
  IconChevronUp,
  IconChevronsLeft,
  IconChevronsRight,
  IconDownload,
  IconExternalLink,
  IconHome,
  IconMenu2,
  IconMusic,
  IconPlayerPauseFilled,
  IconPlayerPlay,
  IconPlayerPlayFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
  IconRepeat,
  IconRewindBackward5,
  IconRewindForward5,
  IconVideo,
  IconVolume,
  IconVolume2,
  IconVolume3,
  IconVolumeOff,
} from "@tabler/icons-react";
import { type PlayerMode, useAppContext } from "@/context/AppContext";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useLyrics } from "@/hooks/useLyrics";
import { usePlayerSheetGestures } from "@/hooks/usePlayerSheetGestures";
import { usePlayerTapGestures } from "@/hooks/usePlayerTapGestures";
import { useStretchPlayer } from "@/hooks/useStretchPlayer";
import { useSyncedVideo } from "@/hooks/useSyncedVideo";
import { HistoryItem, LyricsSettings, Media } from "@/interfaces";
import { youtubeErrorTitle } from "@/lib/apiError";
import { MAX_HISTORY_ITEMS } from "@/lib/constants";
import { patchLastSession } from "@/lib/lastSession";
import { stripVideoTitleFiller } from "@/lib/lyrics";
import {
  getPlaybackPrefs,
  getShowVideo,
  savePlaybackPrefs,
  setShowVideo,
} from "@/lib/playerPrefs";
import { appTheme } from "@/lib/theme";
import { getModeFromRate, getVideoState, saveVideoState } from "@/lib/videoState";
import { getFormattedTime, getYouTubeId, isSupportedURL } from "@/utils";
import {
  createDynamicTheme,
  getOriginalPlatformUrl,
  getSemitonesFromRate,
} from "@/utils/player";
import { StreamError, StreamState, streamWithProgress } from "@/utils/streamer";
import CustomizePlaybackModal from "./CustomizePlaybackModal";
import DownloadModal from "./DownloadModal";
import { ErrorScreen } from "./ErrorScreen";
import LoadingOverlay from "./LoadingOverlay";
import LyricsModal from "./LyricsModal";
import LyricsPanel from "./LyricsPanel";

type PlaybackMode = "slowed" | "normal" | "speedup" | "custom";

const PLAYBACK_MODE_LABELS: Record<PlaybackMode, string> = {
  slowed: "Slowed",
  normal: "Normal",
  speedup: "Speed Up",
  custom: "Custom",
};

const PLAYBACK_MODE_ICONS: Record<PlaybackMode, ReactNode> = {
  slowed: <IconChevronsLeft size={24} />,
  normal: <IconPlayerPlay size={24} />,
  speedup: <IconChevronsRight size={24} />,
  custom: <IconAdjustments size={24} />,
};

/** Survives Strict Mode remounts after sessionStorage is consumed once. */
const searchMetaCache = new Map<string, Record<string, string | number>>();

function getPrepopulatedMetadata(
  url: string,
): Record<string, string | number> | undefined {
  try {
    const id = url.match(
      /^.*(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/,
    )?.[1];
    if (!id) return undefined;
    const stored = sessionStorage.getItem(`moonlit-search-meta:${id}`);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, string | number>;
      searchMetaCache.set(id, parsed);
      sessionStorage.removeItem(`moonlit-search-meta:${id}`);
      return parsed;
    }
    return searchMetaCache.get(id);
  } catch {
    return undefined;
  }
}

export function Player({
  url,
  duration: propDuration,
  media: propMedia,
  repeating: _repeating,
  mode = "expanded",
  autoPlay = true,
  resumePosition = 0,
  onRequestCollapse,
  onRequestExpand,
  onRequestClose,
}: {
  url?: string;
  duration?: number;
  media?: Media;
  repeating?: boolean;
  mode?: Exclude<PlayerMode, "hidden">;
  /** When false (session restore), load the track but stay paused. */
  autoPlay?: boolean;
  /** Seek here once when the stream becomes ready (session restore). */
  resumePosition?: number;
  onRequestCollapse?: () => void;
  onRequestExpand?: () => void;
  onRequestClose?: () => void;
}) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const { media: contextMedia, setMedia, setHistory, setTheme } = useAppContext();
  const isMini = mode === "mini";

  // Phase management: extracting while URL is being resolved, then playing
  const [extractedMedia, setExtractedMedia] = useState<Media | null>(null);
  const [streamState, setStreamState] = useState<StreamState>({ status: "idle" });
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const streamStarted = useRef(false);
  const audioErrorCount = useRef(0);
  const autoPlayedRef = useRef(false);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(148);

  // Check for pre-populated metadata from search results (sessionStorage)
  const initialMeta = useMemo(
    () => (url ? getPrepopulatedMetadata(url) : undefined),
    [url],
  );

  // Keep the player shell mounted while extracting (pasted links have no search meta).
  const provisionalMedia = useMemo<Media | null>(() => {
    if (!url) return null;
    const ytId = getYouTubeId(url);
    if (initialMeta) {
      return {
        fileUrl: "",
        sourceUrl: url,
        metadata: {
          id: ytId || null,
          title: (initialMeta.title as string) || "Unknown",
          author: (initialMeta.author as string) || "Unknown",
          artist: (initialMeta.artist as string) || undefined,
          album: (initialMeta.album as string) || undefined,
          coverUrl: (() => {
            const raw = initialMeta.coverUrl as string | undefined;
            if (!raw) {
              return ytId
                ? `/api/cover?url=${encodeURIComponent(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`)}`
                : "";
            }
            if (
              raw.startsWith("/api/cover") ||
              raw.startsWith("blob:") ||
              raw.startsWith("data:")
            ) {
              return raw;
            }
            return `/api/cover?url=${encodeURIComponent(raw)}`;
          })(),
        },
      };
    }
    // Bare URL — keep shell + optional YT thumb; no "Loading…" placeholder in the dock
    return {
      fileUrl: "",
      sourceUrl: url,
      metadata: {
        id: ytId || null,
        title: "",
        author: "",
        coverUrl: ytId
          ? `/api/cover?url=${encodeURIComponent(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`)}`
          : "",
      },
    };
  }, [url, initialMeta]);

  const media = useMemo(() => {
    // Ignore stale extracted media from the previous track while a new URL loads
    const extracted =
      extractedMedia && (!url || extractedMedia.sourceUrl === url)
        ? extractedMedia
        : null;
    return propMedia || extracted || provisionalMedia || (url ? null : contextMedia);
  }, [propMedia, extractedMedia, provisionalMedia, url, contextMedia]);
  // Show extracting UI only when resolving URL and not in error state
  const isExtracting = !media && !!url && streamState.status !== "error";
  const isMediaReady = Boolean(media?.fileUrl);

  // Inlined extraction logic (was in InitialPlayer + useMediaStreamer)
  const startStream = useCallback(() => {
    if (!url || !isSupportedURL(url)) {
      notifications.show({ title: "Error", message: "Invalid URL provided." });
      return () => {};
    }
    setStreamState({ status: "idle" });
    const abortController = new AbortController();
    const updateStreamState = (next: StreamState) => {
      setStreamState((prev) => ({ ...prev, ...next }));
    };
    streamWithProgress(url, updateStreamState, abortController.signal)
      .then((streamedMedia: Media) => {
        audioErrorCount.current = 0;
        setPlaybackError(null);
        setExtractedMedia(streamedMedia);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("Stream error:", e);
        const code = e instanceof StreamError ? e.code : undefined;
        const message = e instanceof Error ? e.message : "Could not process the media.";
        setStreamState({ status: "error", message });
        const hint =
          code === "RATE_LIMITED"
            ? " Wait a moment and try again."
            : code === "YOUTUBE_BLOCKED" || code === "STREAM_UNAVAILABLE"
              ? " Try configuring cookies from a logged-in account in the app settings."
              : " Try configuring cookies from a logged-in account in the app settings if the problem persists.";
        notifications.show({
          title:
            youtubeErrorTitle(code) === "Request failed"
              ? "Stream failed"
              : youtubeErrorTitle(code),
          message: `${message}${hint}`,
          color: "red",
          autoClose:
            code === "RATE_LIMITED" || code === "YOUTUBE_UNAVAILABLE" ? 20000 : 10000,
        });
      });
    return () => abortController.abort();
  }, [url]);

  const retryExtract = useCallback(() => {
    streamStarted.current = true;
    setStreamState({ status: "idle" });
    startStream();
  }, [startStream]);

  const retryPlayback = useCallback(() => {
    audioErrorCount.current = 0;
    setPlaybackError(null);
    setExtractedMedia(null);
    streamStarted.current = false;
    setStreamState({ status: "idle" });
    setTimeout(() => {
      streamStarted.current = true;
      startStream();
    }, 0);
  }, [startStream]);

  // Reset extraction when the source URL changes (new track while shell stays mounted)
  const prevUrlRef = useRef(url);
  useEffect(() => {
    if (prevUrlRef.current === url) return;
    prevUrlRef.current = url;
    streamStarted.current = false;
    audioErrorCount.current = 0;
    autoPlayedRef.current = false;
    setExtractedMedia(null);
    setPlaybackError(null);
    setStreamState({ status: "idle" });
    // Drop stale context media so old cover/progress cannot linger
    if (url) setMedia(null);
  }, [url, setMedia]);

  // Reset autoplay gate whenever the playable file changes
  useEffect(() => {
    autoPlayedRef.current = false;
  }, [media?.fileUrl]);

  // Auto-start stream for URL mode — check extractedMedia, not media (which includes provisionalMedia)
  useEffect(() => {
    if (extractedMedia || streamStarted.current) return;
    if (!url) return;
    streamStarted.current = true;
    setTimeout(() => startStream(), 0);
  }, [url, extractedMedia, startStream]);

  // Measure bottom chrome for mini-player clip height
  useEffect(() => {
    const el = bottomBarRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setBarHeight(h);
    };
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    const id = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [isMini, media?.metadata.title]);

  useEffect(() => {
    const inset = isMini ? `${barHeight}px` : "0px";
    document.body.style.setProperty("--moonlit-player-inset", inset);
    return () => {
      document.body.style.setProperty("--moonlit-player-inset", "0px");
    };
  }, [isMini, barHeight]);

  // Sync playable extracted media into app context (last-session + shared state)
  useEffect(() => {
    if (!extractedMedia?.fileUrl) return;
    setMedia(extractedMedia);
  }, [extractedMedia, setMedia]);

  // Persist history once media is playable; refresh cover/title when extraction completes
  useEffect(() => {
    if (!media?.sourceUrl || !media.fileUrl) return;
    // Local uploads are session-only — never write them to history
    if (media.sourceUrl.startsWith("local:")) return;
    const snapshot: HistoryItem = {
      ...media,
      playedAt: Date.now(),
      metadata: { ...media.metadata },
    };
    setHistory((prev) => {
      const existingIdx = prev.findIndex((item) => item.sourceUrl === snapshot.sourceUrl);
      const existing = existingIdx >= 0 ? prev[existingIdx] : null;
      const coverUrl = snapshot.metadata.coverUrl || existing?.metadata.coverUrl || "";
      const nextItem: HistoryItem = {
        ...snapshot,
        playedAt: existing?.playedAt ?? Date.now(),
        metadata: {
          ...snapshot.metadata,
          coverUrl,
        },
      };

      if (
        existing &&
        existing.fileUrl === nextItem.fileUrl &&
        existing.metadata.coverUrl === coverUrl &&
        existing.metadata.title === nextItem.metadata.title
      ) {
        return prev;
      }

      if (!existing || existing.fileUrl !== nextItem.fileUrl) {
        nextItem.playedAt = Date.now();
        const filtered = prev.filter((item) => item.sourceUrl !== snapshot.sourceUrl);
        return [nextItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      }

      const next = [...prev];
      next[existingIdx] = nextItem;
      return next;
    });
  }, [media, setHistory]);

  // Use sourceUrl from media state
  const sourceUrl = media?.sourceUrl ?? url ?? "";

  // Global playback prefs (mode/rate/volume are session-wide, not per track)
  const globalPrefs = useMemo(() => getPlaybackPrefs(), []);

  // Per-track state is only for lyrics
  const savedState = useMemo(() => getVideoState(sourceUrl), [sourceUrl]);

  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(globalPrefs.mode);
  const initialStartAt = resumePosition > 0 ? resumePosition : 0;
  const [stateLoaded, setStateLoaded] = useState(false);
  const [isRepeat, setIsRepeat] = useState(globalPrefs.isRepeat);

  // Per-mode rates kept in memory + global prefs
  const [slowedRate, setSlowedRate] = useState(globalPrefs.slowedRate);
  const [normalRate, setNormalRate] = useState(globalPrefs.normalRate);
  const [speedupRate, setSpeedupRate] = useState(globalPrefs.speedupRate);
  const [customRate, setCustomRate] = useState(globalPrefs.customRate);
  const [customSemitones, setCustomSemitones] = useState(globalPrefs.customSemitones);

  // Volume UI state (actual volume is managed by useStretchPlayer)
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const previousVolumeRef = useRef(globalPrefs.volume);

  const [advancedStretch, setAdvancedStretch] = useState(globalPrefs.advancedStretch);

  const [showLyrics, setShowLyrics] = useState(globalPrefs.showLyrics);
  const [showVideo, setShowVideoState] = useState(() => getShowVideo());
  const [lyricsSettings, setLyricsSettings] = useState<LyricsSettings | null>(
    savedState?.lyrics ?? null,
  );
  const [lyricsSettingsUrl, setLyricsSettingsUrl] = useState(sourceUrl);
  // Keep lyrics settings aligned with the current track synchronously (no one-frame leak)
  if (sourceUrl !== lyricsSettingsUrl) {
    setLyricsSettingsUrl(sourceUrl);
    setLyricsSettings(savedState?.lyrics ?? null);
  }
  const [lyricsModalOpened, setLyricsModalOpened] = useState(false);
  const dominantColor = useDominantColor(media?.metadata.coverUrl);
  const barColor = useMemo(() => {
    if (!dominantColor) return theme.colors.violet[5];
    return generateColors(dominantColor)[5];
  }, [dominantColor, theme.colors.violet]);
  const coverUrl = media?.metadata.coverUrl;

  // Set document title to current track name
  useEffect(() => {
    const title = media?.metadata.title;
    document.title = title ? `${title} | Moonlit` : "Moonlit";
  }, [media?.metadata.title]);

  // Sync dominant color as CSS variable + app theme (Home accents follow track)
  useEffect(() => {
    document.body.style.setProperty("--dominant-color", dominantColor || "transparent");
    // Stable base — do not depend on live Mantine theme (avoids setTheme loops)
    setTheme(createDynamicTheme(dominantColor, appTheme));
  }, [dominantColor, setTheme]);

  // Inlined useToast
  const [toast, setToast] = useState<{
    message: React.ReactNode;
    visible: boolean;
    isCircular?: boolean;
  }>({
    message: null,
    visible: false,
  });
  const toastTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const showToast = useCallback((message: React.ReactNode, isCircular?: boolean) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, visible: true, isCircular });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 1200);
  }, []);

  // Initialize state loaded flag
  useEffect(() => {
    const id = requestAnimationFrame(() => setStateLoaded(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Re-extract when audio fails to load (stream URL may have expired)
  const handleAudioError = useCallback(
    (e?: unknown) => {
      if (audioErrorCount.current >= 1) {
        const message =
          e instanceof Error
            ? e.message
            : "Couldn't load audio. Try again or check cookies in settings.";
        setPlaybackError(message);
        notifications.show({
          title: "Playback failed",
          message: `${message} Try configuring cookies from a logged-in account in the app settings if the problem persists.`,
          color: "red",
          autoClose: 10000,
        });
        return;
      }
      audioErrorCount.current++;
      setExtractedMedia(null);
      streamStarted.current = false;
      setStreamState({ status: "idle" });
      setPlaybackError(null);
      setTimeout(() => {
        streamStarted.current = true;
        startStream();
      }, 500);
    },
    [startStream],
  );

  // Unified player (audio + DSP processing)
  const {
    audioRef,
    state: stretchState,
    isPlaying,
    currentTime,
    duration,
    rate,
    semitones,
    reverbAmount,
    volume,
    progress,
    isNativeFallback,
    // Controls
    play,
    pause,
    togglePlayback,
    setRate,
    setSemitones,
    setReverbAmount,
    buffered,
    isWaiting,
    setVolume,
    seek,
  } = useStretchPlayer({
    fileUrl: media?.fileUrl || "",
    sourceUrl,
    advancedStretch,
    initialRate: globalPrefs.rate,
    initialSemitones: globalPrefs.semitones,
    initialReverbAmount: globalPrefs.reverbAmount,
    initialVolume: globalPrefs.volume,
    initialPosition: stateLoaded ? initialStartAt : 0,
    isRepeat,
    autoPlay: false,
    onError: handleAudioError,
  });

  // Try autoplay when playable media is ready (key off fileUrl so provisional media can't steal the flag)
  useEffect(() => {
    if (!autoPlay) return;
    if (!media?.fileUrl || stretchState !== "ready" || autoPlayedRef.current) return;
    autoPlayedRef.current = true;
    const id = setTimeout(async () => {
      try {
        await play();
      } catch {
        autoPlayedRef.current = false;
      }
    }, 100);
    return () => clearTimeout(id);
  }, [autoPlay, media?.fileUrl, stretchState, play]);

  const applyLyricsSettings = useCallback(
    (
      d: {
        id: number | null;
        trackName: string;
        artistName: string;
        albumName?: string;
        syncedLyrics: string;
      },
      extra?: () => void,
    ) => {
      const newSettings: LyricsSettings = {
        id: d.id,
        syncedLyrics: d.syncedLyrics,
        trackName: d.trackName,
        artistName: d.artistName,
        albumName: d.albumName,
        offset: 0,
      };
      setLyricsSettings(newSettings);
      saveVideoState(sourceUrl, { lyrics: newSettings });
      extra?.();
    },
    [sourceUrl],
  );

  const onLyricsDiscover = useCallback(
    (d: Parameters<typeof applyLyricsSettings>[0]) => applyLyricsSettings(d),
    [applyLyricsSettings],
  );

  const {
    lyrics,
    state: lyricsState,
    error: lyricsError,
    searchResults,
  } = useLyrics({
    trackName: media?.metadata.title || "",
    artistName: (media?.metadata.artist ?? media?.metadata.author) || "",
    durationSeconds: duration,
    enabled: duration > 0,
    selectedSyncedLyrics: lyricsSettings?.syncedLyrics,
    offsetSeconds: lyricsSettings?.offset ?? 0,
    onDiscover: onLyricsDiscover,
  });

  // Only open when we have real lyrics — loading / not found / error = lyrics-off layout
  const lyricsOpen = showLyrics && lyricsState === "ready";

  const handleOffsetChange = useCallback(
    (offset: number) => {
      setLyricsSettings((prev) => {
        const updated = prev ? { ...prev, offset } : null;
        saveVideoState(sourceUrl, { lyrics: updated });
        return updated;
      });
    },
    [sourceUrl],
  );

  const isLoading = stretchState === "loading" || isWaiting;
  const isReady = stretchState === "ready";
  const isEnded =
    stretchState === "ready" &&
    currentTime >= duration - 0.05 &&
    duration > 0 &&
    !isWaiting &&
    !isPlaying &&
    !isRepeat;

  const handleAdvancedStretchChange = useCallback((enabled: boolean) => {
    setAdvancedStretch(enabled);
    savePlaybackPrefs({ advancedStretch: enabled });
  }, []);

  const handleToggleShowVideo = useCallback(() => {
    if (!media?.videoUrl || media.isAudioTrackVideo) {
      showToast("Video not available for this track");
      return;
    }
    const next = !showVideo;
    setShowVideoState(next);
    setShowVideo(next);
  }, [media, showVideo, showToast]);

  /** Real motion video available (not YouTube Music ATV static art). */
  const hasVideoStream = Boolean(media?.videoUrl && !media?.isAudioTrackVideo);
  /** User wants video and this track can show it. */
  const showingVideo = Boolean(showVideo && hasVideoStream);

  const { videoRef, isVideoReady, videoEl } = useSyncedVideo({
    src: hasVideoStream ? media?.videoUrl : undefined,
    active: showingVideo,
    isPlaying,
    currentTime,
    rate,
  });
  const showVideoCover = !showingVideo || !isVideoReady;
  const washCanvasRef = useRef<HTMLCanvasElement>(null);

  // Paint a low-res moving wash from the on-screen video frames
  useEffect(() => {
    if (!showingVideo || isMini || !videoEl || !washCanvasRef.current) return;
    const canvas = washCanvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let raf = 0;
    const W = 48;
    const draw = () => {
      if (videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const vw = videoEl.videoWidth || 16;
        const vh = videoEl.videoHeight || 9;
        const H = Math.max(1, Math.round((W * vh) / vw));
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== H) canvas.height = H;
        // cover-style fill
        const scale = Math.max(W / vw, H / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (W - dw) / 2;
        const dy = (H - dh) / 2;
        ctx.drawImage(videoEl, dx, dy, dw, dh);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [showingVideo, videoEl, isMini]);

  const handleReset = useCallback(() => {
    setRate(1);
    setSemitones(0);
    setReverbAmount(0);
    setVolume(1);
    setPlaybackMode("normal");
    setSlowedRate(0.8);
    setNormalRate(1);
    setSpeedupRate(1.25);
    setCustomRate(1);
    setCustomSemitones(0);
    savePlaybackPrefs({
      mode: "normal",
      rate: 1,
      semitones: 0,
      reverbAmount: 0,
      volume: 1,
      slowedRate: 0.8,
      normalRate: 1,
      speedupRate: 1.25,
      customRate: 1,
      customSemitones: 0,
    });
  }, [setRate, setSemitones, setReverbAmount, setVolume]);

  function toastContent(icon: React.ReactNode, text: React.ReactNode) {
    return (
      <Flex align="center" gap="xs">
        {icon}
        <Text fw={600}>{text}</Text>
      </Flex>
    );
  }

  // Media session (browser controls)
  const seekFromUser = useCallback(
    (timeSeconds: number) => {
      const resumeAfterEnd = isEnded;
      seek(timeSeconds);
      if (resumeAfterEnd) void play();
    },
    [isEnded, seek, play],
  );

  const handleBackward = useCallback(() => {
    const newTime = Math.max(0, currentTime - 5);
    seekFromUser(newTime);
    showToast(toastContent(<IconRewindBackward5 size={24} />, "-5s"));
  }, [currentTime, seekFromUser, showToast]);

  const handleForward = useCallback(() => {
    const newTime = Math.min(duration, currentTime + 5);
    seekFromUser(newTime);
    showToast(toastContent(<IconRewindForward5 size={24} />, "+5s"));
  }, [currentTime, duration, seekFromUser, showToast]);

  // Inlined useMediaSession
  useEffect(() => {
    if (!media || !("mediaSession" in navigator)) return;

    const highResCover = coverUrl;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: media.metadata.title,
      artist: media.metadata.artist ?? media.metadata.author,
      album: media.metadata.album ?? "",
      artwork: [{ src: highResCover, sizes: "512x512", type: "image/jpeg" }],
    });

    navigator.mediaSession.setActionHandler("play", () => play());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => handleBackward());
    navigator.mediaSession.setActionHandler("seekforward", () => handleForward());
    navigator.mediaSession.setActionHandler("previoustrack", () => handleBackward());
    navigator.mediaSession.setActionHandler("nexttrack", () => handleForward());
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) seekFromUser(details.seekTime);
      });
    } catch {}

    return () => {
      for (const a of [
        "play",
        "pause",
        "seekbackward",
        "seekforward",
        "previoustrack",
        "nexttrack",
      ]) {
        navigator.mediaSession.setActionHandler(a as MediaSessionAction, null);
      }
      try {
        navigator.mediaSession.setActionHandler("seekto", null);
      } catch {}
    };
  }, [media, coverUrl, play, pause, handleBackward, handleForward, seekFromUser]);

  // Persist global playback prefs (not per-track)
  const lastSaveRef = useRef<number>(0);
  useEffect(() => {
    if (!stateLoaded || !isReady) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;
    savePlaybackPrefs({
      mode: playbackMode,
      rate,
      semitones,
      reverbAmount,
      isRepeat,
      volume,
      advancedStretch,
      showLyrics,
      slowedRate,
      normalRate,
      speedupRate,
      customRate,
      customSemitones,
    });
  }, [
    rate,
    semitones,
    reverbAmount,
    isRepeat,
    volume,
    stateLoaded,
    isReady,
    advancedStretch,
    showLyrics,
    playbackMode,
    slowedRate,
    normalRate,
    speedupRate,
    customRate,
    customSemitones,
  ]);

  // Wake Lock API: keep screen on during playback
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    const acquireWakeLock = async () => {
      try {
        if (wakeLockRef.current) return;
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {}
    };
    const releaseWakeLock = async () => {
      try {
        await wakeLockRef.current?.release();
      } catch {}
      wakeLockRef.current = null;
    };

    if (isPlaying && stateLoaded) acquireWakeLock();
    else releaseWakeLock();

    return () => {
      releaseWakeLock();
    };
  }, [isPlaying, stateLoaded]);

  useEffect(() => {
    const saveState = () => {
      if (!stateLoaded) return;
      savePlaybackPrefs({
        mode: playbackMode,
        rate,
        semitones,
        reverbAmount,
        isRepeat,
        volume,
        advancedStretch,
        showLyrics,
        slowedRate,
        normalRate,
        speedupRate,
        customRate,
        customSemitones,
      });
      if (sourceUrl) {
        saveVideoState(sourceUrl, {
          rate,
          semitones,
          reverbAmount,
          isRepeat,
          volume,
          showLyrics,
          advancedStretch,
          lyrics: lyricsSettings,
        });
        if (!sourceUrl.startsWith("local:")) {
          patchLastSession(sourceUrl, { positionSeconds: currentTime });
        }
      }
    };
    const handler = () => {
      if (document.hidden) saveState();
    };
    window.addEventListener("beforeunload", saveState);
    document.addEventListener("visibilitychange", handler);
    return () => {
      saveState();
      window.removeEventListener("beforeunload", saveState);
      document.removeEventListener("visibilitychange", handler);
    };
  }, [
    rate,
    semitones,
    reverbAmount,
    isRepeat,
    volume,
    sourceUrl,
    stateLoaded,
    showLyrics,
    advancedStretch,
    playbackMode,
    slowedRate,
    normalRate,
    speedupRate,
    customRate,
    customSemitones,
    lyricsSettings,
    currentTime,
  ]);

  // Throttled progress persistence while the track is active
  useEffect(() => {
    if (!sourceUrl || sourceUrl.startsWith("local:") || !stateLoaded) return;
    if (!Number.isFinite(currentTime) || currentTime < 0) return;
    const id = window.setTimeout(() => {
      patchLastSession(sourceUrl, { positionSeconds: currentTime });
    }, 1500);
    return () => window.clearTimeout(id);
  }, [sourceUrl, currentTime, stateLoaded]);

  // Modal controls
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [downloadModalOpened, { open: openDownloadModal, close: closeDownloadModal }] =
    useDisclosure(false);

  const [seekPosition, setSeekPosition] = useState<number | null>(null);
  const seekPositionRef = useRef<number | null>(null);
  const wasPlayingOnSeekRef = useRef(false);
  const [isSeekTrackHovered, setIsSeekTrackHovered] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const showSeekChrome = isSeekTrackHovered || isSeeking;
  // Fixed slot so the thumb never jumps when the bar thickens
  const seekSlotHeight = 5;
  const seekTrackHeight = showSeekChrome ? 5 : 2;
  const seekThumbSize = 17;

  // Clear scrub UI whenever the track source changes
  useEffect(() => {
    seekPositionRef.current = null;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSeekPosition(null);
      setIsSeeking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [url, media?.fileUrl]);

  const displayTime = isMediaReady ? (seekPosition ?? currentTime) : 0;
  const displayDuration = isMediaReady ? duration : 0;

  const handleSliderChange = useCallback((value: number) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[Player slider] onChange", value);
    }
    setIsSeeking(true);
    seekPositionRef.current = value;
    setSeekPosition(value);
  }, []);

  const handleSeekEnd = useCallback(
    (value: number) => {
      const finalPosition = seekPositionRef.current ?? value;
      if (process.env.NODE_ENV !== "production") {
        console.debug("[Player slider] onChangeEnd", {
          callbackValue: value,
          latestPosition: seekPositionRef.current,
          finalPosition,
        });
      }
      const resumeAfterEnd = isEnded;
      seek(finalPosition);
      seekPositionRef.current = null;
      setSeekPosition(null);
      setIsSeeking(false);
      // Scrubbing can stall native/advanced playback — resume if it was playing
      // or if the track had finished (seek-from-end should autoplay).
      if (wasPlayingOnSeekRef.current || resumeAfterEnd) {
        void play();
      }
    },
    [seek, play, isEnded],
  );

  const seekTrackRef = useRef<HTMLDivElement>(null);
  const handleTrackPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || duration <= 0 || !isMediaReady) return;
      const track = seekTrackRef.current;
      if (!track) return;

      event.preventDefault();
      event.stopPropagation();
      wasPlayingOnSeekRef.current = isPlaying || isEnded;
      track.setPointerCapture?.(event.pointerId);

      const updatePosition = (clientX: number) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const value = Math.round(ratio * duration * 10) / 10;
        handleSliderChange(value);
        return value;
      };

      updatePosition(event.clientX);
      const onMove = (moveEvent: PointerEvent) => {
        updatePosition(moveEvent.clientX);
      };
      const onUp = (upEvent: PointerEvent) => {
        const value = updatePosition(upEvent.clientX);
        handleSeekEnd(value);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp, { once: true });
    },
    [duration, handleSeekEnd, handleSliderChange, isPlaying, isEnded, isMediaReady],
  );

  const handleTogglePlayer = useCallback(() => {
    if (isEnded) {
      seek(0);
      play();
      showToast(<IconPlayerPlayFilled size={40} />, true);
    } else {
      togglePlayback();
      if (isPlaying) {
        showToast(<IconPlayerPauseFilled size={40} />, true);
      } else {
        showToast(<IconPlayerPlayFilled size={40} />, true);
      }
    }
  }, [isEnded, isPlaying, togglePlayback, seek, play, showToast]);

  const handleRateChange = useCallback(
    (newRate: number) => {
      setRate(newRate);
      // Save rate per current mode
      const mode = getModeFromRate(newRate, semitones);
      if (mode === "slowed") setSlowedRate(newRate);
      else if (mode === "normal") setNormalRate(newRate);
      else if (mode === "speedup") setSpeedupRate(newRate);
      else setCustomRate(newRate);
      setPlaybackMode(mode);
    },
    [setRate, semitones],
  );

  const handleSemitonesChange = useCallback(
    (newSemitones: number) => {
      setSemitones(newSemitones);
      if (playbackMode === "custom") setCustomSemitones(newSemitones);
    },
    [setSemitones, playbackMode],
  );

  const handlePlaybackModeChange = useCallback(
    (mode: PlaybackMode) => {
      setPlaybackMode(mode);
      let newRate: number;
      let newSemitones: number;

      if (mode === "slowed") {
        newRate = slowedRate;
        newSemitones = getSemitonesFromRate(newRate);
      } else if (mode === "normal") {
        newRate = normalRate;
        newSemitones = 0;
      } else if (mode === "speedup") {
        newRate = speedupRate;
        newSemitones = getSemitonesFromRate(newRate);
      } else {
        newRate = customRate;
        newSemitones = customSemitones;
      }

      setRate(newRate);
      setSemitones(newSemitones);
      showToast(
        toastContent(
          PLAYBACK_MODE_ICONS[mode],
          `${PLAYBACK_MODE_LABELS[mode]} (${newRate.toFixed(2)}x)`,
        ),
      );
    },
    [
      slowedRate,
      normalRate,
      speedupRate,
      customRate,
      customSemitones,
      setRate,
      setSemitones,
      showToast,
    ],
  );

  const toggleLoop = useCallback(() => {
    setIsRepeat(!isRepeat);
    showToast(
      toastContent(
        <IconRepeat size={24} style={{ opacity: !isRepeat ? 1 : 0.5 }} />,
        !isRepeat ? "Repeat On" : "Repeat Off",
      ),
    );
  }, [isRepeat, showToast]);

  // Volume handlers
  const handleMuteToggle = useCallback(() => {
    if (isMuted || volume === 0) {
      const newVol = previousVolumeRef.current > 0 ? previousVolumeRef.current : 1;
      setVolume(newVol);
      setIsMuted(false);
      showToast(toastContent(<IconVolume3 size={24} />, "Unmuted"));
    } else {
      previousVolumeRef.current = volume;
      setVolume(0);
      setIsMuted(true);
      showToast(toastContent(<IconVolumeOff size={24} />, "Muted"));
    }
  }, [isMuted, volume, setVolume, showToast]);

  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    },
    [setVolume],
  );

  const getVolumeIcon = useCallback(() => {
    if (isMuted || volume === 0) return <IconVolumeOff size={24} />;
    if (volume < 0.66) return <IconVolume2 size={24} />;
    return <IconVolume size={24} />;
  }, [isMuted, volume]);

  const showRateToast = useCallback(
    (newRate: number, icon: React.ReactNode) => {
      showToast(toastContent(icon, `${newRate.toFixed(2)}x`));
    },
    [showToast],
  );

  useHotkeys([
    ["ArrowLeft", handleBackward],
    ["ArrowRight", handleForward],
    ["Space", handleTogglePlayer],
    ["k", handleTogglePlayer],
    ["m", handleMuteToggle],
    [
      "shift+<",
      () => {
        const newRate = Math.max(0.5, rate - 0.05);
        handleRateChange(Math.round(newRate * 100) / 100);
        showRateToast(newRate, <IconPlayerTrackPrevFilled size={24} />);
      },
    ],
    [
      "shift+>",
      () => {
        const newRate = Math.min(1.5, rate + 0.05);
        handleRateChange(Math.round(newRate * 100) / 100);
        showRateToast(newRate, <IconPlayerTrackNextFilled size={24} />);
      },
    ],
  ]);

  const dynamicTheme = useMemo(
    () => createDynamicTheme(dominantColor, appTheme),
    [dominantColor],
  );

  const playerAreaRef = useRef<HTMLDivElement>(null);
  usePlayerTapGestures(playerAreaRef, {
    onBackward: handleBackward,
    onForward: handleForward,
    onTogglePlayback: handleTogglePlayer,
    enabled: !isMini,
  });

  const handleToggleShowLyrics = useCallback((next: boolean) => {
    setShowLyrics(next);
    savePlaybackPrefs({ showLyrics: next });
  }, []);

  const { dragY, lyricsDrag, isDragging, stageRef } = usePlayerSheetGestures({
    enabled: Boolean(isMobile && !isMini),
    lyricsOpen,
    canToggleLyrics: lyricsState === "ready",
    onCollapse: () => onRequestCollapse?.(),
    onOpenLyrics: () => handleToggleShowLyrics(true),
    onCloseLyrics: () => handleToggleShowLyrics(false),
  });

  // 0 = lyrics fully on-screen, 1 = fully off to the right
  const lyricsClosedAmt = lyricsDrag !== null ? lyricsDrag : lyricsOpen ? 0 : 1;
  const lyricsInteractive = lyricsDrag !== null || lyricsOpen;

  const handleChromeClick = useCallback(() => {
    if (isMini) onRequestExpand?.();
    else onRequestCollapse?.();
  }, [isMini, onRequestCollapse, onRequestExpand]);

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleChromeClick();
    },
    [handleChromeClick],
  );

  // === Extraction UI (shown before player mounts) ===
  if (streamState.status === "error" && !media) {
    return (
      <Box
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
        }}
      >
        <ErrorScreen
          title="Stream failed"
          message={
            streamState.message ||
            "Could not process the media. Try configuring cookies from a logged-in account in settings."
          }
          primaryLabel="Retry"
          onPrimary={retryExtract}
          secondaryLabel="Go home"
          onSecondary={() => onRequestClose?.()}
        />
      </Box>
    );
  }

  if (isExtracting) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          backgroundColor: theme.colors.dark[7],
        }}
      >
        <LoadingOverlay visible message="Extracting stream..." />
      </div>
    );
  }

  if (!media) return null;

  const originalPlatformUrl = getOriginalPlatformUrl(media, currentTime);

  return (
    <MantineProvider theme={dynamicTheme} forceColorScheme="dark">
      <CustomizePlaybackModal
        opened={modalOpened}
        onClose={closeModal}
        advancedStretch={advancedStretch}
        onAdvancedStretchChange={handleAdvancedStretchChange}
        rate={rate}
        onSpeedChangeEnd={handleRateChange}
        semitones={semitones}
        onPitchChangeEnd={handleSemitonesChange}
        reverbAmount={reverbAmount}
        onReverbChange={setReverbAmount}
        onReset={handleReset}
      />

      <DownloadModal
        opened={downloadModalOpened}
        onClose={closeDownloadModal}
        media={media}
        currentPlaybackRate={rate}
        currentSemitones={semitones}
        currentReverbAmount={reverbAmount}
      />

      <LyricsModal
        opened={lyricsModalOpened}
        onClose={() => setLyricsModalOpened(false)}
        showLyrics={showLyrics}
        onToggleLyrics={handleToggleShowLyrics}
        trackDurationSeconds={duration}
        currentLyricsId={lyricsSettings?.id ?? null}
        currentLyricsTrackName={lyricsSettings?.trackName ?? null}
        currentLyricsArtistName={lyricsSettings?.artistName ?? null}
        currentLyricsAlbumName={lyricsSettings?.albumName ?? null}
        currentOffset={lyricsSettings?.offset ?? 0}
        onOffsetChange={handleOffsetChange}
        initialSearchQuery={
          stripVideoTitleFiller(media.metadata.title) || media.metadata.title
        }
        initialSearchResults={searchResults}
        onSelectLyrics={(record) => {
          applyLyricsSettings(record, () => {
            handleToggleShowLyrics(true);
            setLyricsModalOpened(false);
          });
        }}
      />

      {/* Sliding stage — moves as one paper sheet top→bottom; dock stays fixed */}
      <Box
        ref={stageRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          transform: isMini ? "translateY(100%)" : `translateY(${dragY}px)`,
          transition: isDragging
            ? "none"
            : "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
          willChange: "transform",
          pointerEvents: isMini ? "none" : "auto",
          backgroundColor: theme.colors.dark[7],
          overflow: "hidden",
          touchAction: isMobile ? "none" : undefined,
        }}
      >
        {/* Blurred wash — live video frames when showing video, else cover art */}
        {showingVideo && media.videoUrl ? (
          <>
            <canvas
              ref={washCanvasRef}
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "blur(48px) saturate(1.45)",
                opacity: isVideoReady ? 0.45 : 0,
                transform: "scale(1.15)",
                pointerEvents: "none",
                transition: "opacity 0.35s ease-out",
              }}
            />
            <Box
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                backgroundColor: "rgba(26, 27, 30, 0.4)",
                pointerEvents: "none",
              }}
            />
          </>
        ) : coverUrl ? (
          <>
            <Box
              key={`wash-${sourceUrl || coverUrl}`}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                backgroundImage: `url(${coverUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(60px) saturate(1.5)",
                opacity: 0.4,
                transform: "scale(1.1)",
                pointerEvents: "none",
              }}
            />
            <Box
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                backgroundColor: "rgba(26, 27, 30, 0.35)",
                pointerEvents: "none",
              }}
            />
          </>
        ) : (
          <Box
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              backgroundColor: theme.colors.dark[7],
            }}
          />
        )}

        <Box
          style={{
            position: "relative",
            height: "100%",
            width: "100%",
            zIndex: 1,
          }}
        >
          {/* Top Controls */}
          <Flex
            style={{
              position: "absolute",
              top: 28,
              left: 0,
              right: 0,
              zIndex: 2,
            }}
            gap="sm"
            wrap="wrap"
            px="lg"
          >
            <Flex
              style={{ flex: 1 }}
              justify="center"
              align="center"
              direction="column"
              gap="sm"
            >
              <SegmentedControl
                disabled={isLoading}
                tabIndex={-1}
                bg={theme.colors.dark[6]}
                color="brand"
                style={{ boxShadow: "0px 0px 0px 1px #383A3F" }}
                size="sm"
                onChange={(value) => handlePlaybackModeChange(value as PlaybackMode)}
                value={playbackMode}
                data={[
                  { label: "Slowed", value: "slowed" },
                  { label: "Normal", value: "normal" },
                  { label: "Speed Up", value: "speedup" },
                  {
                    label: (
                      <Center>
                        <IconAdjustments size={18} />
                        <Box ml={10}>Custom</Box>
                      </Center>
                    ),
                    value: "custom",
                  },
                ]}
              />
              {playbackMode === "custom" && (
                <Button variant="default" onClick={openModal}>
                  Customize Playback
                </Button>
              )}
            </Flex>
          </Flex>

          {/* Main content: video + lyrics panel — center in stage above dock */}
          <Box
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: barHeight,
              zIndex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              // Keep art clear of top controls / floating chrome without overshrinking video
              paddingTop: isMobile ? 64 : 56,
              paddingBottom: isMobile ? (isMini ? 8 : 44) : isMini ? 12 : 48,
              boxSizing: "border-box",
              overflow: "hidden",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {/* Main layout container */}
            <Flex
              align="center"
              justify="center"
              gap={!isMobile && lyricsOpen ? 32 : 0}
              style={{
                height: "100%",
                width: "100%",
                maxWidth: "100%",
                padding: isMobile ? 0 : "0 24px",
                position: "relative",
              }}
            >
              {/* Video area with toast overlay */}
              <Box
                ref={playerAreaRef}
                data-tap-target
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                }}
              >
                {/* Toast overlay - centered on video */}
                <Box
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <Transition
                    mounted={toast.visible}
                    transition="pop"
                    duration={200}
                    timingFunction="ease"
                  >
                    {(styles) => (
                      <Box
                        style={{
                          ...styles,
                          background: "rgba(0, 0, 0, 0.45)",
                          backdropFilter: "blur(12px)",
                          borderRadius: toast.isCircular ? "50%" : theme.radius.xl,
                          padding: toast.isCircular ? "20px" : "12px 24px",
                          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: toast.isCircular ? "90px" : "auto",
                          height: toast.isCircular ? "90px" : "auto",
                        }}
                      >
                        {toast.message}
                      </Box>
                    )}
                  </Transition>
                </Box>

                {/* Album art / video + loading overlay + hidden audio element */}
                <Box
                  style={{
                    position: "relative",
                    width: (() => {
                      const lyricsBeside = !isMobile && lyricsOpen;
                      if (showingVideo) {
                        if (isMobile) return "min(calc(100vw - 24px), 100vw)";
                        // Cap height via width = height * 16/9
                        return lyricsBeside
                          ? "min(56vw, calc(44vh * 16 / 9))"
                          : "min(86vw, calc(58vh * 16 / 9))";
                      }
                      if (isMobile) return "min(calc(100vw - 24px), 52vh)";
                      return lyricsBeside ? "min(40vw, 58vh)" : "min(50vw, 60vh)";
                    })(),
                    aspectRatio: showingVideo ? "16 / 9" : "1 / 1",
                    height: "auto",
                    margin: isMobile ? 12 : 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: isMobile ? Math.max(0, lyricsClosedAmt) : 1,
                    pointerEvents: isMobile && lyricsClosedAmt < 0.5 ? "none" : "auto",
                    transition:
                      lyricsDrag !== null
                        ? "none"
                        : "opacity 0.3s ease-out, width 0.25s ease-out",
                  }}
                >
                  <audio
                    ref={audioRef}
                    key={media.fileUrl}
                    style={{ display: "none" }}
                    preload="metadata"
                  />
                  {/* Keep video mounted whenever a stream exists — hide instead of unmount. */}
                  {hasVideoStream && media.videoUrl ? (
                    <video
                      ref={videoRef}
                      key={media.videoUrl}
                      src={media.videoUrl}
                      muted
                      playsInline
                      preload={showingVideo ? "auto" : "metadata"}
                      poster={coverUrl || undefined}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        borderRadius: theme.radius.md,
                        userSelect: "none",
                        pointerEvents: "none",
                        background: "rgba(0,0,0,0.35)",
                        opacity: showingVideo && isVideoReady ? 1 : 0,
                        filter: stretchState === "loading" ? "blur(8px)" : "none",
                        transition: "opacity 0.2s ease-out, filter 0.3s ease-out",
                      }}
                    />
                  ) : null}
                  {showVideoCover ? (
                    media.metadata.coverUrl ? (
                      <Image
                        key={sourceUrl || coverUrl}
                        src={coverUrl}
                        width="100%"
                        height="100%"
                        radius={theme.radius.md}
                        fit="contain"
                        style={{
                          userSelect: "none",
                          pointerEvents: "none",
                          filter: stretchState === "loading" ? "blur(8px)" : "none",
                          transition: "filter 0.3s ease-out",
                        }}
                        alt={media.metadata.title}
                      />
                    ) : (
                      <Box
                        w="100%"
                        h="100%"
                        bg="rgba(255,255,255,0.1)"
                        style={{
                          borderRadius: theme.radius.md,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "column",
                          gap: 10,
                          userSelect: "none",
                          filter: stretchState === "loading" ? "blur(8px)" : "none",
                          transition: "filter 0.3s ease-out",
                        }}
                      >
                        <IconMusic size={80} style={{ opacity: 0.5 }} />
                        <Text size="xl" fw={600} ta="center">
                          {media.metadata.title}
                        </Text>
                        <Text size="md" c="dimmed" ta="center">
                          {media.metadata.artist ?? media.metadata.author}
                          {media.metadata.album && ` · ${media.metadata.album}`}
                        </Text>
                      </Box>
                    )
                  ) : null}
                  {/* Buffering spinner — centered on album art, no background */}
                  {isWaiting && (
                    <Box
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10,
                        pointerEvents: "none",
                      }}
                    >
                      <Loader size="md" color="white" />
                    </Box>
                  )}
                  {/* Processing overlay with progress bar */}
                  {stretchState === "loading" && !isWaiting && (
                    <Box
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10,
                        pointerEvents: "none",
                      }}
                    >
                      <Box
                        style={{
                          background: "rgba(0, 0, 0, 0.45)",
                          backdropFilter: "blur(12px)",
                          borderRadius: theme.radius.sm,
                          padding: "16px 24px",
                          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <Text style={{ color: "white" }} fw={600}>
                          Processing the audio…
                        </Text>
                        <Box style={{ width: 200 }}>
                          <Progress
                            value={progress?.percent ?? 100}
                            striped
                            animated
                            color="rgba(255, 255, 255, 0.7)"
                            bg="rgba(255, 255, 255, 0.1)"
                            size="sm"
                          />
                        </Box>
                      </Box>
                    </Box>
                  )}
                  {stretchState === "error" && (
                    <Box
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 11,
                      }}
                    >
                      <Box
                        style={{
                          background: "rgba(0, 0, 0, 0.55)",
                          backdropFilter: "blur(12px)",
                          borderRadius: theme.radius.sm,
                          padding: "16px 24px",
                          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 12,
                          maxWidth: 320,
                          textAlign: "center",
                        }}
                      >
                        <Text style={{ color: "white" }} fw={600}>
                          Couldn&apos;t load audio
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.75)" }} size="sm">
                          {playbackError ||
                            "Playback failed. Try again or check cookies in settings."}
                        </Text>
                        <Button
                          size="sm"
                          variant="light"
                          color="red"
                          onClick={retryPlayback}
                        >
                          Retry playback
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Desktop: Lyrics panel - slides in/out as sibling */}
              {!isMobile && (
                <Box
                  style={{
                    position: "relative",
                    width: lyricsOpen ? "min(400px, 35vw)" : 0,
                    minWidth: 0,
                    height: "80vh",
                    flexShrink: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    opacity: lyricsOpen ? 1 : 0,
                    transform: lyricsOpen ? "translateX(0)" : "translateX(40px)",
                    transition:
                      "width 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease-out, transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
                    pointerEvents: lyricsOpen ? "auto" : "none",
                    backgroundColor: "transparent",
                  }}
                >
                  <LyricsPanel
                    lyrics={lyricsState === "ready" ? lyrics : []}
                    state={lyricsState}
                    error={lyricsError}
                    currentTimeSeconds={currentTime}
                    isPlaying={isPlaying}
                    onSeek={seekFromUser}
                    visible={lyricsOpen}
                    style={{ flex: 1, minHeight: 0, minWidth: 0, width: "100%" }}
                  />
                </Box>
              )}
            </Flex>

            {/* Mobile: Lyrics overlay — finger-follow drag + snap */}
            {isMobile && lyricsState === "ready" && (
              <Box
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 2,
                  background: "transparent",
                  backdropFilter: `blur(${(1 - lyricsClosedAmt) * 6}px)`,
                  WebkitBackdropFilter: `blur(${(1 - lyricsClosedAmt) * 6}px)`,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  transform: `translateX(${lyricsClosedAmt * 100}%)`,
                  opacity: lyricsInteractive ? 1 : 0,
                  transition:
                    lyricsDrag !== null
                      ? "none"
                      : "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease-out",
                  pointerEvents: lyricsClosedAmt < 0.98 ? "auto" : "none",
                  willChange: "transform",
                }}
              >
                <LyricsPanel
                  lyrics={lyrics}
                  state={lyricsState}
                  error={lyricsError}
                  currentTimeSeconds={currentTime}
                  isPlaying={isPlaying}
                  onSeek={seekFromUser}
                  style={{ flex: 1, minHeight: 0, minWidth: 0, width: "100%" }}
                  isMobile
                  visible={lyricsClosedAmt < 0.5}
                />
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Floating chrome above dock: mobile timer + expanded Lyrics/Menu share one row */}
      {(isMobile || !isMini) && (
        <Flex
          align="center"
          justify="space-between"
          gap="xs"
          style={{
            position: "fixed",
            left: 10,
            right: 10,
            // Keep the same bottom offset in mini + expanded so the timer does not jump
            bottom: barHeight + 8,
            height: 36,
            zIndex: 202,
            pointerEvents: "none",
          }}
        >
          {isMobile && (
            <Box
              style={{
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                paddingLeft: 14,
                paddingRight: 14,
                boxShadow: "0px 0px 0px 1px #383A3F",
                backgroundColor: theme.colors.dark[6],
                borderRadius: theme.radius.sm,
                opacity: isMediaReady ? 1 : 0.45,
                pointerEvents: "none",
                flexShrink: 0,
              }}
            >
              <Text
                fz="sm"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  lineHeight: 1,
                }}
              >
                {`${getFormattedTime(displayTime)} / ${getFormattedTime(displayDuration)}`}
              </Text>
            </Box>
          )}
          {!isMini && (
            <Flex gap="xs" style={{ pointerEvents: "auto", marginLeft: "auto" }}>
              <Button
                variant="default"
                size="sm"
                h={36}
                leftSection={<IconMusic size={18} />}
                onClick={() => setLyricsModalOpened(true)}
                loading={lyricsState === "loading"}
              >
                Lyrics
              </Button>
              <Menu shadow="md" width={200} position="top-end">
                <Menu.Target>
                  <Button
                    variant="default"
                    size="sm"
                    h={36}
                    leftSection={<IconMenu2 size={18} />}
                  >
                    Menu
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Navigation</Menu.Label>
                  <Menu.Item
                    leftSection={<IconHome size={14} />}
                    onClick={() => onRequestCollapse?.()}
                  >
                    Home
                  </Menu.Item>
                  {originalPlatformUrl && (
                    <Menu.Item
                      leftSection={
                        media.isAudioTrackVideo ? (
                          <SiYoutubemusic size={14} />
                        ) : (
                          <SiYoutube size={14} />
                        )
                      }
                      component="a"
                      href={originalPlatformUrl}
                      rightSection={<IconExternalLink size={12} />}
                      target="_blank"
                    >
                      {media.isAudioTrackVideo ? "YouTube Music" : "YouTube"}
                    </Menu.Item>
                  )}
                  <Menu.Divider />
                  <Menu.Label>Actions</Menu.Label>
                  {!media?.isAudioTrackVideo && (
                    <Menu.Item
                      leftSection={<IconVideo size={14} />}
                      onClick={handleToggleShowVideo}
                      disabled={!media?.videoUrl && !showVideo}
                      rightSection={
                        showVideo && media?.videoUrl ? (
                          <Text size="xs" c="dimmed">
                            On
                          </Text>
                        ) : undefined
                      }
                    >
                      Show video
                    </Menu.Item>
                  )}
                  <Menu.Item
                    leftSection={<IconDownload size={14} />}
                    onClick={openDownloadModal}
                  >
                    Download
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Flex>
          )}
        </Flex>
      )}

      {/* Fixed dock — seek + transport; does not slide away */}
      <Box
        ref={bottomBarRef}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 201,
          pointerEvents: "auto",
          backgroundColor: theme.colors.dark[7],
          boxShadow: isMini ? "0 -8px 24px rgba(0,0,0,0.35)" : undefined,
        }}
      >
        {/* Seek flush to dock top edge — height 0 so thumb/track never add a black band */}
        <Box
          style={{
            position: "relative",
            width: "100%",
            height: 0,
            flexShrink: 0,
            overflow: "visible",
            zIndex: 5,
          }}
        >
          <Box
            ref={seekTrackRef}
            onPointerDown={handleTrackPointerDown}
            onMouseEnter={() => setIsSeekTrackHovered(true)}
            onMouseLeave={() => setIsSeekTrackHovered(false)}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: -12,
              height: 24,
              touchAction: "none",
              cursor: "pointer",
              zIndex: 3,
            }}
          />
          {displayDuration > 0 &&
            buffered.map((range, i) => (
              <Box
                key={i}
                style={{
                  position: "absolute",
                  left: `${(range.start / displayDuration) * 100}%`,
                  width: `${((range.end - range.start) / displayDuration) * 100}%`,
                  height: seekTrackHeight,
                  top: 0,
                  backgroundColor: "rgba(255, 255, 255, 0.12)",
                  borderRadius: 0,
                  pointerEvents: "none",
                  zIndex: 0,
                  transition: "height 0.15s",
                }}
              />
            ))}
          <Slider
            style={{
              pointerEvents: "none",
              width: "100%",
              height: seekSlotHeight,
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
            }}
            disabled={!isMediaReady || (isLoading && !isNativeFallback)}
            value={displayTime}
            onChange={handleSliderChange}
            onChangeEnd={handleSeekEnd}
            min={0}
            step={0.1}
            radius={0}
            showLabelOnHover={false}
            size="xs"
            thumbSize={seekThumbSize}
            styles={{
              root: { width: "100%", height: seekSlotHeight },
              trackContainer: {
                overflow: "visible",
                height: seekSlotHeight,
              },
              track: {
                height: seekTrackHeight,
                backgroundColor: "rgba(255, 255, 255, 0.12)",
                transition: "height 0.15s",
              },
              bar: {
                backgroundColor: barColor,
                transition: "height 0.15s",
              },
              thumb: {
                border: "none",
                borderWidth: 0,
                boxShadow: "none",
                backgroundColor: barColor,
                borderRadius: "50%",
                boxSizing: "border-box",
                padding: 0,
                opacity: showSeekChrome ? 1 : 0,
                transition: "opacity 0.12s ease",
                // Never capture hover — the hit area above owns it (avoids thumb jitter)
                pointerEvents: "none",
              },
            }}
            label={(v) =>
              displayTime >= displayDuration - 5 ? null : getFormattedTime(v)
            }
            max={Math.max(displayDuration, 0.1)}
          />
        </Box>

        <Box style={{ backgroundColor: theme.colors.dark[7], paddingTop: 4 }}>
          <Flex gap={isMobile ? 4 : "sm"} px="xs" py="xs" align="center">
            {/* Transport controls — clicks must not collapse */}
            <Flex align="center" gap={isMobile ? 2 : 4}>
              <ActionIcon
                size="xl"
                onClick={handleTogglePlayer}
                title={isPlaying ? "Pause" : "Play"}
                variant="transparent"
                color="gray"
                disabled={isLoading || !isMediaReady}
              >
                {isPlaying ? (
                  <IconPlayerPauseFilled size={30} />
                ) : (
                  <IconPlayerPlayFilled size={30} />
                )}
              </ActionIcon>
              <Flex
                align="center"
                onMouseEnter={() => setIsVolumeHovered(true)}
                onMouseLeave={() => setIsVolumeHovered(false)}
                style={{ position: "relative" }}
              >
                <ActionIcon
                  size="lg"
                  disabled={isLoading}
                  onClick={handleMuteToggle}
                  title={isMuted || volume === 0 ? "Unmute" : "Mute"}
                  variant="transparent"
                  color="gray"
                >
                  {getVolumeIcon()}
                </ActionIcon>
                <Box
                  style={{
                    width: isVolumeHovered ? 80 : 0,
                    overflow: "hidden",
                    transition: "width 0.2s ease",
                  }}
                >
                  <Slider
                    disabled={isLoading}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    min={0}
                    max={1}
                    step={0.01}
                    size="sm"
                    w={70}
                    ml={4}
                    styles={{
                      thumb: {
                        borderWidth: 0,
                        borderRadius: "50%",
                      },
                    }}
                  />
                </Box>
              </Flex>
              {!isMobile && (
                <Text
                  size="xs"
                  c="dimmed"
                  ml={4}
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    width: "13ch",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    opacity: isMediaReady ? 1 : 0.45,
                  }}
                >
                  {`${getFormattedTime(displayTime)} / ${getFormattedTime(displayDuration)}`}
                </Text>
              )}
            </Flex>

            {/* Title / cover — only this area (plus chevron) toggles mini */}
            <Flex
              ml={isMobile ? 4 : { base: 0, xs: "lg" }}
              style={{ minWidth: 0, flex: 1, cursor: "pointer" }}
              onClick={handleChromeClick}
              align="center"
              gap={isMobile ? 6 : undefined}
            >
              <Image
                key={sourceUrl || coverUrl || "cover"}
                src={coverUrl || undefined}
                radius="sm"
                h={38}
                w={38}
                visibleFrom="xs"
                alt="cover image"
                style={{
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  pointerEvents: "none",
                  flexShrink: 0,
                  opacity: isMediaReady ? 1 : 0.55,
                }}
              />
              <Box ml="sm" style={{ minWidth: 0, flex: 1 }}>
                <Flex align="center" gap={6}>
                  <Text size="sm" fw={600} lineClamp={1}>
                    {media.metadata.title || "\u00A0"}
                  </Text>
                </Flex>
                {(media.metadata.artist || media.metadata.author) && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {media.metadata.artist ?? media.metadata.author}
                    {media.metadata.album && ` · ${media.metadata.album}`}
                  </Text>
                )}
              </Box>
            </Flex>

            <ActionIcon
              size="lg"
              disabled={isLoading}
              onClick={toggleLoop}
              title={isRepeat ? "Turn off Repeat" : "Repeat"}
              variant="transparent"
              color="gray"
              style={{
                flexShrink: 0,
                opacity: isRepeat ? 1 : 0.5,
              }}
            >
              <IconRepeat />
            </ActionIcon>
            <ActionIcon
              size="lg"
              variant="transparent"
              color="gray"
              title={isMini ? "Expand player" : "Minimize player"}
              onClick={handleChevronClick}
              style={{ flexShrink: 0 }}
            >
              {isMini ? <IconChevronUp size={22} /> : <IconChevronDown size={22} />}
            </ActionIcon>
          </Flex>
        </Box>
      </Box>
    </MantineProvider>
  );
}
