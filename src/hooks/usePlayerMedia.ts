"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import type { Media } from "@/interfaces";
import { youtubeErrorTitle } from "@/lib/apiError";
import { buildProvisionalMedia, mergePlayerMedia } from "@/lib/mergePlayerMedia";
import { mergeTrackMetadata, peekSearchMeta } from "@/lib/searchMeta";
import { getYouTubeId, isSupportedURL } from "@/utils";
import { isSameMediaSource } from "@/utils/player";
import { StreamError, type StreamState, streamWithProgress } from "@/utils/streamer";

type UsePlayerMediaArgs = {
  url?: string;
  contextMedia: Media | null;
  setMedia: (media: Media | null | ((prev: Media | null) => Media | null)) => void;
  onRequestClose?: () => void;
  /** Called when the playable source changes in a way that should retry autoplay. */
  onInvalidateAutoplay?: () => void;
};

export function usePlayerMedia({
  url,
  contextMedia,
  setMedia,
  onRequestClose,
  onInvalidateAutoplay,
}: UsePlayerMediaArgs) {
  const [extractedMedia, setExtractedMedia] = useState<Media | null>(null);
  const [streamState, setStreamState] = useState<StreamState>({ status: "idle" });
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const streamStarted = useRef(false);
  /** Per-sourceUrl playback failures. Must NOT reset on extract success or cursed
   * streams (extract OK, play fail) re-extract forever and burn the rate limit. */
  const audioErrorCount = useRef(0);
  const extractAbortRef = useRef<AbortController | null>(null);
  const audioErrorRetryRef = useRef<number | null>(null);
  const urlRef = useRef(url);

  const initialMeta = useMemo(() => {
    if (!url) return undefined;
    const id = getYouTubeId(url);
    return id ? peekSearchMeta(id) : undefined;
  }, [url]);

  const provisionalMedia = useMemo(
    () => (url ? buildProvisionalMedia(url, initialMeta) : null),
    [url, initialMeta],
  );

  const media = useMemo(
    () =>
      mergePlayerMedia({
        url,
        extractedMedia,
        contextMedia,
        provisionalMedia,
      }),
    [extractedMedia, provisionalMedia, url, contextMedia],
  );

  const isExtracting = !media && !!url && streamState.status !== "error";
  const isMediaReady = Boolean(media?.fileUrl);

  const startStream = useCallback(() => {
    if (!url || !isSupportedURL(url)) {
      notifications.show({ title: "Error", message: "Invalid URL provided." });
      return;
    }
    extractAbortRef.current?.abort();
    const abortController = new AbortController();
    extractAbortRef.current = abortController;
    setStreamState({ status: "idle" });
    const updateStreamState = (next: StreamState) => {
      setStreamState((prev) => ({ ...prev, ...next }));
    };
    streamWithProgress(url, updateStreamState, abortController.signal)
      .then((streamedMedia: Media) => {
        if (abortController.signal.aborted) return;
        // Do not reset audioErrorCount here — extract OK + play fail must not loop.
        setPlaybackError(null);
        const ytId = getYouTubeId(url);
        setExtractedMedia({
          ...streamedMedia,
          metadata: mergeTrackMetadata(
            streamedMedia.metadata,
            ytId ? peekSearchMeta(ytId) : undefined,
          ),
        });
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (abortController.signal.aborted) return;
        console.error("Stream error:", e);
        const code = e instanceof StreamError ? e.code : undefined;
        const message = e instanceof Error ? e.message : "Could not process the media.";
        setExtractedMedia(null);
        setPlaybackError(null);
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
        // Provisional media keeps the player shell mounted; leave it so we don't
        // stick on "Processing the audio…" after extract failures (e.g. TVOD blocks).
        onRequestClose?.();
      });
  }, [url, onRequestClose]);

  const retryExtract = useCallback(() => {
    audioErrorCount.current = 0;
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
    queueMicrotask(() => {
      streamStarted.current = true;
      startStream();
    });
  }, [startStream]);

  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  // Reset extraction when the source URL changes (new track while shell stays mounted)
  const prevUrlRef = useRef(url);
  useEffect(() => {
    if (prevUrlRef.current === url) return;
    prevUrlRef.current = url;
    extractAbortRef.current?.abort();
    extractAbortRef.current = null;
    if (audioErrorRetryRef.current !== null) {
      window.clearTimeout(audioErrorRetryRef.current);
      audioErrorRetryRef.current = null;
    }
    streamStarted.current = false;
    audioErrorCount.current = 0;
    onInvalidateAutoplay?.();
    setExtractedMedia(null);
    setPlaybackError(null);
    setStreamState({ status: "idle" });
    // Keep media already seeded for this URL (history replay). Only drop unrelated tracks.
    if (url) {
      setMedia((prev) => {
        if (!prev) return null;
        if (isSameMediaSource(prev.sourceUrl, url)) return prev;
        const prevId = getYouTubeId(prev.sourceUrl) ?? prev.metadata.id;
        const nextId = getYouTubeId(url);
        if (prevId && nextId && String(prevId) === String(nextId)) return prev;
        return null;
      });
    }
  }, [url, setMedia, onInvalidateAutoplay]);

  // Ensure extracted media for URL mode: adopt a history/cache seed, or start extract.
  useEffect(() => {
    if (!url) return;

    const seeded =
      contextMedia?.fileUrl && isSameMediaSource(contextMedia.sourceUrl, url)
        ? contextMedia
        : null;

    if (seeded && extractedMedia?.fileUrl !== seeded.fileUrl) {
      extractAbortRef.current?.abort();
      extractAbortRef.current = null;
      const adopt = seeded;
      const timer = window.setTimeout(() => {
        onInvalidateAutoplay?.();
        streamStarted.current = true;
        setExtractedMedia(adopt);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (extractedMedia || streamStarted.current) return;
    streamStarted.current = true;

    const timer = window.setTimeout(() => {
      if (seeded) {
        setExtractedMedia(seeded);
        return;
      }
      startStream();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      extractAbortRef.current?.abort();
      extractAbortRef.current = null;
      streamStarted.current = false;
    };
    // Seed payload reads full contextMedia; deps key identity only so metadata
    // updates do not abort an in-flight extract.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [url, extractedMedia, contextMedia?.fileUrl, contextMedia?.sourceUrl, startStream]);

  // Sync playable extracted media into app context (last-session + shared state).
  useEffect(() => {
    if (!extractedMedia?.fileUrl) return;
    const ytId = getYouTubeId(extractedMedia.sourceUrl);
    setMedia({
      ...extractedMedia,
      metadata: mergeTrackMetadata(
        extractedMedia.metadata,
        ytId ? peekSearchMeta(ytId) : undefined,
      ),
    });
  }, [extractedMedia, setMedia]);

  const handleAudioError = useCallback(
    (e?: unknown) => {
      const message =
        e instanceof Error
          ? e.message
          : "Couldn't load audio. Try again or check cookies in settings.";

      if (audioErrorCount.current >= 1) {
        setPlaybackError(message);
        setStreamState({ status: "error", message });
        notifications.show({
          title: "Playback failed",
          message: `${message} Try configuring cookies from a logged-in account in the app settings if the problem persists.`,
          color: "red",
          autoClose: 10000,
        });
        onRequestClose?.();
        return;
      }
      audioErrorCount.current++;
      // Drop expired fileUrl but keep titles/cover so the shell doesn't flash Unknown.
      if (contextMedia && (!url || isSameMediaSource(contextMedia.sourceUrl, url))) {
        setMedia({
          fileUrl: "",
          sourceUrl: contextMedia.sourceUrl,
          metadata: contextMedia.metadata,
        });
      }
      setExtractedMedia(null);
      streamStarted.current = true;
      setStreamState({ status: "idle" });
      setPlaybackError(null);
      if (audioErrorRetryRef.current !== null) {
        window.clearTimeout(audioErrorRetryRef.current);
      }
      const retryUrl = url;
      audioErrorRetryRef.current = window.setTimeout(() => {
        audioErrorRetryRef.current = null;
        if (urlRef.current !== retryUrl) return;
        startStream();
      }, 500);
    },
    [startStream, onRequestClose, contextMedia, url, setMedia],
  );

  useEffect(() => {
    return () => {
      extractAbortRef.current?.abort();
      if (audioErrorRetryRef.current !== null) {
        window.clearTimeout(audioErrorRetryRef.current);
      }
    };
  }, []);

  return {
    media,
    extractedMedia,
    streamState,
    playbackError,
    isExtracting,
    isMediaReady,
    retryExtract,
    retryPlayback,
    handleAudioError,
  };
}
