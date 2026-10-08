"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import { useYouTubeStatus } from "@/context/YouTubeStatusContext";
import type { Media } from "@/interfaces";
import { youtubeErrorTitle } from "@/lib/apiError";
import { mergeTrackMetadata, peekSearchMeta } from "@/lib/searchMeta";
import { getYouTubeId } from "@/utils";
import { StreamError, type StreamState, streamWithProgress } from "@/utils/streamer";

type Args = {
  url?: string;
  revision: number;
  contextMedia: Media | null;
  setMedia: React.Dispatch<React.SetStateAction<Media | null>>;
  onRequestClose?: () => void;
};

/** AppContext owns the media; this hook owns only its preparation and retry. */
export function usePlayerMedia({
  url,
  revision,
  contextMedia,
  setMedia,
  onRequestClose,
}: Args) {
  const { localOnly } = useYouTubeStatus();
  const sourceUrl = url || contextMedia?.sourceUrl || "";
  const key = sourceUrl + ":" + revision;
  const [request, setRequest] = useState({ key: "", attempt: 0 });
  const attempt = request.key === key ? request.attempt : 0;
  const [streamState, setStreamState] = useState<StreamState>({ status: "idle" });
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const failures = useRef({ key: "", count: 0 });
  const completed = useRef("");
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeKey = useRef(key);

  useEffect(() => {
    activeKey.current = key;
    failures.current = { key, count: 0 };
    return () => clearTimeout(retryTimer.current);
  }, [key]);

  const retry = useCallback(() => {
    clearTimeout(retryTimer.current);
    failures.current = { key, count: 0 };
    setPlaybackError(null);
    setRequest((previous) => ({
      key,
      attempt: (previous.key === key ? previous.attempt : 0) + 1,
    }));
  }, [key]);

  useEffect(() => {
    if (!sourceUrl) return;
    const requestKey = key + ":" + attempt;
    if (contextMedia?.fileUrl && (!attempt || completed.current === requestKey)) {
      setStreamState({ status: "ready" });
      setPlaybackError(null);
      return;
    }
    const controller = new AbortController();
    setPlaybackError(null);
    setStreamState({ status: "extracting", message: "Preparing audio…" });
    setMedia((previous) => (previous ? { ...previous, fileUrl: "" } : previous));
    void streamWithProgress(
      sourceUrl,
      (next) => {
        if (!controller.signal.aborted) setStreamState(next);
      },
      controller.signal,
      { localOnly },
    )
      .then((media) => {
        if (controller.signal.aborted) return;
        const id = getYouTubeId(sourceUrl);
        completed.current = requestKey;
        setMedia((previous) => ({
          ...media,
          metadata: mergeTrackMetadata(
            media.metadata,
            previous?.metadata,
            id ? peekSearchMeta(id) : undefined,
          ),
        }));
        setStreamState({ status: "ready" });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const code = error instanceof StreamError ? error.code : undefined;
        const message =
          error instanceof Error ? error.message : "Could not process the media.";
        setStreamState({ status: "error", message });
        if (code !== "LOCAL_MEDIA_UNAVAILABLE")
          notifications.show({
            title:
              youtubeErrorTitle(code) === "Request failed"
                ? "Stream failed"
                : youtubeErrorTitle(code),
            message:
              message + (code === "RATE_LIMITED" ? " Wait a moment and try again." : ""),
            color: "red",
            autoClose:
              code === "RATE_LIMITED" || code === "YOUTUBE_UNAVAILABLE" ? 20000 : 10000,
          });
        onRequestClose?.();
      });
    return () => controller.abort();
    // The media is a seed for this request. Its completion must not start another request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl, key, attempt, localOnly, setMedia, onRequestClose]);

  const handleAudioError = useCallback(
    (error?: unknown) => {
      const message =
        error instanceof Error ? error.message : "Couldn't load audio. Please try again.";
      if (failures.current.key !== key) failures.current = { key, count: 0 };
      if (failures.current.count++ >= 1 || sourceUrl.startsWith("local:")) {
        setPlaybackError(message);
        setStreamState({ status: "error", message });
        notifications.show({
          title: "Playback failed",
          message,
          color: "red",
          autoClose: 10000,
        });
        onRequestClose?.();
        return;
      }
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        if (activeKey.current !== key) return;
        setRequest((previous) => ({
          key,
          attempt: (previous.key === key ? previous.attempt : 0) + 1,
        }));
      }, 500);
    },
    [key, sourceUrl, onRequestClose],
  );

  return {
    media: contextMedia,
    streamState,
    playbackError,
    isExtracting: !contextMedia?.fileUrl && !!sourceUrl && streamState.status !== "error",
    isMediaReady: Boolean(contextMedia?.fileUrl),
    retryExtract: retry,
    retryPlayback: retry,
    handleAudioError,
  };
}
