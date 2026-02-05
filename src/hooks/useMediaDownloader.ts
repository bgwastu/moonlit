import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { usePostHog } from "posthog-js/react";
import { useAppContext } from "@/context/AppContext";
import { Media } from "@/interfaces";
import { isSupportedURL } from "@/utils";
import { isTikTokURL, isYoutubeURL } from "@/utils";
import { DownloadState, downloadWithProgress } from "@/utils/downloader";

export function useMediaDownloader(url: string, metadata: Partial<Media["metadata"]>) {
  const router = useRouter();
  const posthog = usePostHog();
  const { setMedia } = useAppContext();

  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: "idle",
    percent: 0,
  });

  const startDownload = useCallback(
    (withVideo?: boolean, downloadQuality: "high" | "low" = "high") => {
      // Analytics
      let eventName = "media_download";
      if (isYoutubeURL(url)) eventName = "youtube_download";
      else if (isTikTokURL(url)) eventName = "tiktok_download";

      posthog?.capture(eventName, { url });

      if (!isSupportedURL(url)) {
        notifications.show({
          title: "Error",
          message: "Invalid URL provided.",
        });
        router.push("/");
        return () => {};
      }

      setMedia(null);
      setDownloadState({ status: "idle", percent: 0 });

      const abortController = new AbortController();

      downloadWithProgress(
        url,
        metadata,
        setDownloadState,
        abortController.signal,
        withVideo,
        downloadQuality,
      )
        .then((downloadedMedia: Media) => {
          setMedia(downloadedMedia);
        })
        .catch((e) => {
          if (e.name === "AbortError") return;
          console.error("Download error:", e);
          const message = e.message || "Could not process the media.";
          setDownloadState({
            status: "error",
            percent: 0,
            message,
          });
          notifications.show({
            title: "Download failed",
            message: `${message} Try configuring cookies from a logged-in account in the app settings if the problem persists.`,
            color: "red",
            autoClose: 10000,
          });
        });

      return () => {
        abortController.abort();
      };
    },
    [url, router, posthog, setMedia, metadata],
  );

  return { downloadState, startDownload };
}
