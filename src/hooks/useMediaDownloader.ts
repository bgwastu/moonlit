import { songAtom } from "@/state";
import { isSupportedURL } from "@/utils";
import { DownloadState, downloadWithProgress } from "@/utils/downloader";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useCallback, useState } from "react";
import { Song } from "@/interfaces";

export function useMediaDownloader(
  youtubeId: string,
  isShorts: boolean,
  metadata: Partial<Song["metadata"]>,
) {
  const router = useRouter();
  const posthog = usePostHog();
  const [, setSong] = useAtom(songAtom);

  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: "idle",
    percent: 0,
  });

  const startDownload = useCallback(
    (withVideo?: boolean, downloadQuality: "high" | "low" = "high") => {
      const pageType = isShorts ? "shorts_page" : "watch_page";
      posthog.capture(pageType, { youtubeId });

      const url = isShorts
        ? `https://youtube.com/shorts/${youtubeId}`
        : `https://youtube.com/watch?v=${youtubeId}`;

      if (!isSupportedURL(url)) {
        notifications.show({
          title: "Error",
          message: "Invalid URL generated.",
        });
        router.push("/");
        return () => {};
      }

      (setSong as (song: Song | null) => void)(null);
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
          (setSong as (song: Song | null) => void)(downloadedSong);
        })
        .catch((e) => {
          if (e.name === "AbortError") return;
          console.error(`${pageType}: Download error:`, e);
          setDownloadState({
            status: "error",
            percent: 0,
            message: e.message,
          });
          notifications.show({
            title: "Download error",
            message: e.message || "Could not process the video.",
          });
          router.push("/");
        });

      return () => {
        abortController.abort();
      };
    },
    [isShorts, youtubeId, router, posthog, setSong, metadata],
  );

  return { downloadState, startDownload };
}
