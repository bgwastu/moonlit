import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useAppContext } from "@/context/AppContext";
import { Media } from "@/interfaces";
import { isSupportedURL } from "@/utils";
import { StreamState, streamWithProgress } from "@/utils/streamer";

export function useMediaStreamer(url: string, metadata: Partial<Media["metadata"]>) {
  const router = useRouter();
  const { setMedia } = useAppContext();

  const [streamState, setStreamState] = useState<StreamState>({
    status: "idle",
  });

  const startStream = useCallback(() => {
    if (!isSupportedURL(url)) {
      notifications.show({
        title: "Error",
        message: "Invalid URL provided.",
      });
      router.push("/");
      return () => {};
    }

    setMedia(null);
    setStreamState({ status: "idle" });

    const abortController = new AbortController();

    const updateStreamState = (next: StreamState) => {
      setStreamState((prev) => ({
        ...prev,
        ...next,
        metadata: next.metadata ?? prev.metadata,
        duration: next.duration ?? prev.duration,
      }));
    };

    streamWithProgress(url, metadata, updateStreamState, abortController.signal)
      .then((streamedMedia: Media) => {
        setMedia(streamedMedia);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        console.error("Stream error:", e);
        const message = e.message || "Could not process the media.";
        setStreamState({
          status: "error",
          message,
        });
        notifications.show({
          title: "Stream failed",
          message: `${message} Try configuring cookies from a logged-in account in the app settings if the problem persists.`,
          color: "red",
          autoClose: 10000,
        });
      });

    return () => {
      abortController.abort();
    };
  }, [url, router, setMedia, metadata]);

  return { streamState, startStream };
}
