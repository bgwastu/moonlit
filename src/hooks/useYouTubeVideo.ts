"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COOKIES_CHANGED_EVENT } from "@/lib/cookies";
import { prepareMedia } from "@/lib/mediaPreparation";

type Resource = {
  key: string;
  status: "idle" | "loading" | "ready" | "error";
  url?: string;
  message?: string;
};

/** Video is optional: never change audio media, history, or audio availability. */
export function useYouTubeVideo(videoId: string | undefined, enabled: boolean) {
  const [credentialsVersion, setCredentialsVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [resource, setResource] = useState<Resource>({ key: "", status: "idle" });
  const cached = useRef<{ key: string; url: string; expiresAt: number } | null>(null);
  const key = `${videoId || ""}:${credentialsVersion}:${attempt}`;

  useEffect(() => {
    const changed = () => setCredentialsVersion((version) => version + 1);
    window.addEventListener(COOKIES_CHANGED_EVENT, changed);
    return () => window.removeEventListener(COOKIES_CHANGED_EVENT, changed);
  }, []);

  useEffect(() => {
    if (!videoId || !enabled) return;
    if (cached.current?.key === key && cached.current.expiresAt > Date.now()) {
      setResource({ key, status: "ready", url: cached.current.url });
      return;
    }
    const controller = new AbortController();
    setResource({ key, status: "loading", message: "Preparing video…" });
    void prepareMedia(
      `https://www.youtube.com/watch?v=${videoId}`,
      "video",
      controller.signal,
      (message) => {
        if (!controller.signal.aborted) setResource({ key, status: "loading", message });
      },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.contentType !== "video/mp4")
          throw new Error("This track has no compatible video.");
        const url = `/api/stream/${result.token}`;
        cached.current = { key, url, expiresAt: Date.now() + 5 * 60 * 60 * 1000 };
        setResource({ key, status: "ready", url });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResource({
            key,
            status: "error",
            message: (error as Error).message || "Video is unavailable.",
          });
      });
    return () => controller.abort();
  }, [videoId, enabled, key]);

  const retry = useCallback(() => {
    cached.current = null;
    setAttempt((value) => value + 1);
  }, []);
  const onPlaybackError = useCallback(() => {
    cached.current = null;
    setResource({
      key,
      status: "error",
      message: "Video could not be played. You can keep listening with artwork.",
    });
  }, [key]);

  return {
    ...(resource.key === key ? resource : { key, status: "idle" as const }),
    retry,
    onPlaybackError,
  };
}
