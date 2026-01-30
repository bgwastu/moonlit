import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { usePostHog } from "posthog-js/react";
import { useAppContext } from "@/context/AppContext";
import { Song } from "@/interfaces";
import { isSupportedURL } from "@/utils";
import { isTikTokURL, isYoutubeURL } from "@/utils";
import { DownloadState, downloadWithProgress } from "@/utils/downloader";

export function useMediaDownloader(url: string, metadata: Partial<Song["metadata"]>) {
  const router = useRouter();
  const posthog = usePostHog();
  const { setSong } = useAppContext();

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

      posthog.capture(eventName, { url });

      if (!isSupportedURL(url)) {
        notifications.show({
          title: "Error",
          message: "Invalid URL provided.",
        });
        router.push("/");
        return () => {};
      }

      setSong(null);
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
        .then((downloadedSong: Song) => {
          setSong(downloadedSong);
        })
        .catch((e) => {
          if (e.name === "AbortError") return;
          console.error("Download error:", e);
          setDownloadState({
            status: "error",
            percent: 0,
            message: e.message,
          });
          notifications.show({
            title: "Download error",
            message: e.message || "Could not process the media.",
          });
          router.push("/");
        });

      return () => {
        abortController.abort();
      };
    },
    [url, router, posthog, setSong, metadata],
  );

  return { downloadState, startDownload };
}
