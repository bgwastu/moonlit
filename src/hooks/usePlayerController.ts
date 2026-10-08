"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/context/AppContext";
import { useYouTubeStatus } from "@/context/YouTubeStatusContext";
import { usePlayerMedia } from "@/hooks/usePlayerMedia";
import { useStretchPlayer } from "@/hooks/useStretchPlayer";
import { useSyncedVideo } from "@/hooks/useSyncedVideo";
import { useYouTubeVideo } from "@/hooks/useYouTubeVideo";
import type { HistoryItem } from "@/interfaces";
import { MAX_HISTORY_ITEMS } from "@/lib/constants";
import { mergeTrackMetadata } from "@/lib/searchMeta";
import {
  DEFAULT_PLAYBACK_PREFS,
  type GlobalPlaybackMode,
  type GlobalPlaybackPrefs,
  getPlaybackPrefs,
  getShowVideo,
  savePlaybackPosition,
  savePlaybackPrefs,
  setShowVideo,
} from "@/lib/storage";
import { isMarkedAudioTrackVideo } from "@/lib/trackFlags";
import { getYouTubeId, isYoutubeURL } from "@/utils";
import { getModeFromRate, getSemitonesFromRate } from "@/utils/player";

type Settings = GlobalPlaybackPrefs & { showVideo: boolean };
function modeValues(settings: Settings, mode: GlobalPlaybackMode) {
  const rate =
    mode === "slowed"
      ? settings.slowedRate
      : mode === "speedup"
        ? settings.speedupRate
        : mode === "custom"
          ? settings.customRate
          : settings.normalRate;
  return {
    rate,
    semitones:
      mode === "custom"
        ? settings.customSemitones
        : mode === "normal"
          ? 0
          : getSemitonesFromRate(rate),
  };
}

/** The persistent player owns one preparation, engine, preferences and video session. */
export function usePlayerController({
  url,
  autoPlay,
  resumePosition,
  isMini,
  onRequestClose,
}: {
  url?: string;
  autoPlay: boolean;
  resumePosition: number;
  isMini: boolean;
  onRequestClose?: () => void;
}) {
  const {
    media: contextMedia,
    setMedia,
    setHistory,
    isHistoryWriteAllowed,
    playerRevision,
  } = useAppContext();
  const prepared = usePlayerMedia({
    url,
    revision: playerRevision,
    contextMedia,
    setMedia,
    onRequestClose,
  });
  const { media } = prepared;
  const sourceUrl = media?.sourceUrl || url || "";
  const [settings, setSettings] = useState<Settings>(() => ({
    ...getPlaybackPrefs(),
    showVideo: getShowVideo(),
  }));
  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...partial }));
    const { showVideo, ...playback } = partial;
    if (showVideo !== undefined) setShowVideo(showVideo);
    if (Object.keys(playback).length) savePlaybackPrefs(playback);
  }, []);
  const engine = useStretchPlayer({
    fileUrl: media?.fileUrl || "",
    sourceUrl,
    advancedStretch: settings.advancedStretch,
    initialRate: settings.rate,
    initialSemitones: settings.semitones,
    initialReverbAmount: settings.reverbAmount,
    initialVolume: settings.volume,
    initialPosition: Math.max(0, resumePosition || 0),
    isRepeat: settings.isRepeat,
    onError: prepared.handleAudioError,
  });
  const { setRate, setSemitones, setVolume, setReverbAmount, play, getPlaybackTime } =
    engine;
  const isReady = engine.state === "ready";
  const isEnded =
    isReady &&
    engine.duration > 0 &&
    engine.currentTime >= engine.duration - 0.05 &&
    !engine.isWaiting &&
    !engine.isPlaying &&
    !settings.isRepeat;

  // A layout or processing-mode change never creates a new autoplay request.
  const autoplayed = useRef("");
  const autoplayKey = playerRevision + ":" + (media?.fileUrl || "");
  const configured = useRef("");
  const configurationKey = autoplayKey + ":" + settings.advancedStretch;
  useEffect(() => {
    if (!media?.fileUrl || !isReady || configured.current === configurationKey) return;
    configured.current = configurationKey;
    const values = modeValues(settings, settings.mode);
    setRate(values.rate);
    setSemitones(values.semitones);
    if (settings.rate !== values.rate || settings.semitones !== values.semitones)
      savePlaybackPrefs(values);
  }, [configurationKey, media?.fileUrl, isReady, settings, setRate, setSemitones]);

  useEffect(() => {
    if (!autoPlay || !media?.fileUrl || !isReady || autoplayed.current === autoplayKey)
      return;
    let cancelled = false;
    let completed = false;
    autoplayed.current = autoplayKey;
    const timer = setTimeout(async () => {
      const ok = await play();
      if (cancelled) return;
      completed = ok;
      if (!ok) autoplayed.current = "";
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (!completed && autoplayed.current === autoplayKey) autoplayed.current = "";
    };
  }, [autoPlay, autoplayKey, media?.fileUrl, isReady, play]);

  const handleRateChange = useCallback(
    (rate: number) => {
      setRate(rate);
      const mode =
        settings.mode === "custom" ? "custom" : getModeFromRate(rate, engine.semitones);
      const rateKey =
        mode === "slowed"
          ? "slowedRate"
          : mode === "speedup"
            ? "speedupRate"
            : mode === "normal"
              ? "normalRate"
              : "customRate";
      updateSettings({ mode, rate, [rateKey]: rate });
    },
    [settings.mode, engine.semitones, setRate, updateSettings],
  );
  const handleSemitonesChange = useCallback(
    (semitones: number) => {
      setSemitones(semitones);
      updateSettings({
        semitones,
        ...(settings.mode === "custom" ? { customSemitones: semitones } : {}),
      });
    },
    [settings.mode, setSemitones, updateSettings],
  );
  const selectPlaybackMode = useCallback(
    (mode: GlobalPlaybackMode) => {
      const values = modeValues(settings, mode);
      setRate(values.rate);
      setSemitones(values.semitones);
      updateSettings({ mode, ...values });
      return values.rate;
    },
    [settings, setRate, setSemitones, updateSettings],
  );
  const changeVolume = useCallback(
    (volume: number) => {
      const value = Math.max(0, Math.min(1, volume));
      setVolume(value);
      updateSettings({ volume: value });
    },
    [setVolume, updateSettings],
  );
  const changeReverb = useCallback(
    (reverbAmount: number) => {
      const value = Math.max(0, Math.min(1, reverbAmount));
      setReverbAmount(value);
      updateSettings({ reverbAmount: value });
    },
    [setReverbAmount, updateSettings],
  );
  const handleReset = useCallback(() => {
    const {
      mode,
      rate,
      semitones,
      reverbAmount,
      volume,
      slowedRate,
      normalRate,
      speedupRate,
      customRate,
      customSemitones,
    } = DEFAULT_PLAYBACK_PREFS;
    setRate(rate);
    setSemitones(semitones);
    setReverbAmount(reverbAmount);
    setVolume(volume);
    updateSettings({
      mode,
      rate,
      semitones,
      reverbAmount,
      volume,
      slowedRate,
      normalRate,
      speedupRate,
      customRate,
      customSemitones,
    });
  }, [setRate, setSemitones, setReverbAmount, setVolume, updateSettings]);
  const setIsRepeat = useCallback(
    (isRepeat: boolean) => updateSettings({ isRepeat }),
    [updateSettings],
  );
  const setShowLyrics = useCallback(
    (showLyrics: boolean) => updateSettings({ showLyrics }),
    [updateSettings],
  );
  const setShowRomanization = useCallback(
    (showRomanization: boolean) => updateSettings({ showRomanization }),
    [updateSettings],
  );
  const handleAdvancedStretchChange = useCallback(
    (advancedStretch: boolean) => updateSettings({ advancedStretch }),
    [updateSettings],
  );
  const toggleVideo = useCallback(
    () => updateSettings({ showVideo: !settings.showVideo }),
    [settings.showVideo, updateSettings],
  );

  // Keep history in the shared session; metadata updates retain the existing order.
  useEffect(() => {
    if (!media?.fileUrl || !isHistoryWriteAllowed()) return;
    const snapshot: HistoryItem = { ...media, playedAt: Date.now() };
    setHistory((previous) => {
      const index = previous.findIndex((item) => item.sourceUrl === snapshot.sourceUrl);
      const existing = previous[index];
      const metadata = mergeTrackMetadata(snapshot.metadata, existing?.metadata);
      if (
        existing?.fileUrl === snapshot.fileUrl &&
        JSON.stringify(existing.metadata) === JSON.stringify(metadata)
      )
        return previous;
      const item = {
        ...snapshot,
        metadata,
        playedAt: existing?.fileUrl === snapshot.fileUrl ? existing.playedAt : Date.now(),
      };
      if (!existing || existing.fileUrl !== snapshot.fileUrl)
        return [item, ...previous.filter((entry) => entry.sourceUrl !== sourceUrl)].slice(
          0,
          MAX_HISTORY_ITEMS,
        );
      return previous.map((entry, at) => (at === index ? item : entry));
    });
  }, [media, sourceUrl, setHistory, isHistoryWriteAllowed]);

  // Save during playback, on paused seeks, and when leaving the player.
  const pausedPosition = engine.isPlaying ? null : engine.currentTime;
  useEffect(() => {
    if (!sourceUrl || sourceUrl.startsWith("local:") || !isReady) return;
    const save = () => {
      if (isHistoryWriteAllowed()) savePlaybackPosition(sourceUrl, getPlaybackTime());
    };
    const hidden = () => {
      if (document.hidden) save();
    };
    save();
    const timer = engine.isPlaying ? setInterval(save, 5000) : undefined;
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      save();
      clearInterval(timer);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [
    sourceUrl,
    isReady,
    engine.isPlaying,
    pausedPosition,
    getPlaybackTime,
    isHistoryWriteAllowed,
  ]);

  useEffect(() => {
    if (!engine.isPlaying) return;
    let lock: WakeLockSentinel;
    let cancelled = false;
    void navigator.wakeLock
      ?.request("screen")
      .then((next) => {
        if (cancelled) void next.release();
        else lock = next;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release().catch(() => {});
    };
  }, [engine.isPlaying]);

  const { localOnly } = useYouTubeStatus();
  const id = isYoutubeURL(sourceUrl) ? getYouTubeId(sourceUrl) : undefined;
  const youtubeVideoId =
    !localOnly && !media?.isAudioTrackVideo && !isMarkedAudioTrackVideo(id)
      ? id
      : undefined;
  const localVideoUrl =
    media?.videoUrl && !media.videoUrl.startsWith("/api/stream/")
      ? media.videoUrl
      : undefined;
  const hasVideoStream = Boolean(youtubeVideoId || localVideoUrl);
  const showingVideo = settings.showVideo && hasVideoStream;
  const youtubeVideo = useYouTubeVideo(
    youtubeVideoId,
    showingVideo && isReady && !isMini,
  );
  const nativeVideoUrl = youtubeVideoId
    ? youtubeVideo.status === "ready"
      ? youtubeVideo.url
      : undefined
    : localVideoUrl;
  const [localVideoAttempt, setLocalVideoAttempt] = useState(0);
  const syncedVideo = useSyncedVideo({
    src: nativeVideoUrl,
    active: showingVideo && !isMini,
    isPlaying: engine.isPlaying,
    getPlaybackTime,
    rate: engine.rate,
    onError: youtubeVideoId ? youtubeVideo.onPlaybackError : undefined,
  });
  const retryVideo = () =>
    youtubeVideoId
      ? youtubeVideo.retry()
      : setLocalVideoAttempt((attempt) => attempt + 1);
  const videoError = showingVideo
    ? youtubeVideo.status === "error"
      ? youtubeVideo.message
      : syncedVideo.error
    : undefined;

  return {
    ...engine,
    ...prepared,
    ...syncedVideo,
    sourceUrl,
    isReady,
    localOnly,
    isLoading: engine.state === "loading" || engine.isWaiting,
    isEnded,
    playbackMode: settings.mode,
    isRepeat: settings.isRepeat,
    advancedStretch: settings.advancedStretch,
    showLyrics: settings.showLyrics,
    showRomanization: settings.showRomanization,
    showVideo: settings.showVideo,
    handleRateChange,
    handleSemitonesChange,
    selectPlaybackMode,
    handleReset,
    setIsRepeat,
    setShowLyrics,
    setShowRomanization,
    handleAdvancedStretchChange,
    setVolume: changeVolume,
    setReverbAmount: changeReverb,
    toggleVideo,
    youtubeVideo,
    youtubeVideoId,
    hasVideoStream,
    showingVideo,
    nativeVideoUrl,
    localVideoAttempt,
    retryVideo,
    videoError,
    showVideoCover: !showingVideo || !syncedVideo.isVideoReady,
  };
}
