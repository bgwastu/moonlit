"use client";

import useNoSleep from "@/hooks/useNoSleep";
import { Song } from "@/interfaces";
import { getCookiesToUse } from "@/lib/cookies";
import { songAtom } from "@/state";
import { getYouTubeId, isSupportedURL } from "@/utils";
import { getMedia, setMedia, setMeta, getMeta } from "@/utils/cache";
import {
  Button,
  Center,
  Container,
  Flex,
  Image,
  Progress,
  Text,
  rem,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMusic } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useState, useEffect, useRef } from "react";
import Icon from "./Icon";
import { Player } from "./Player";

interface InitialPlayerProps {
  youtubeId: string;
  isShorts: boolean;
  metadata: Partial<Song["metadata"]>;
}

interface DownloadState {
  status:
    | "idle"
    | "fetching"
    | "downloading"
    | "processing"
    | "complete"
    | "error";
  percent: number;
  speed?: string;
  eta?: string;
  message?: string;
}

async function downloadWithProgress(
  url: string,
  preload: Partial<Song["metadata"]>,
  onProgress: (state: DownloadState) => void,
  abortSignal?: AbortSignal,
): Promise<Song> {
  const id = getYouTubeId(url);

  // Check cache first
  if (id) {
    const videoKey = `yt:${id}:video`;
    const audioKey = `yt:${id}:audio`;
    const cachedVideo = await getMedia(videoKey);
    if (cachedVideo) {
      const storedMeta = await getMeta<Partial<Song["metadata"]>>(`yt:${id}`);
      const blobUrl = URL.createObjectURL(cachedVideo);
      onProgress({ status: "complete", percent: 100 });
      return {
        fileUrl: blobUrl,
        videoUrl: blobUrl,
        metadata: {
          id,
          title: "Loading...",
          author: "Loading...",
          coverUrl: "",
          platform: "youtube",
          ...(storedMeta || {}),
          ...(preload || {}),
        },
      };
    }
    const cachedAudio = await getMedia(audioKey);
    if (cachedAudio) {
      const storedMeta = await getMeta<Partial<Song["metadata"]>>(`yt:${id}`);
      const audioUrl = URL.createObjectURL(cachedAudio);
      onProgress({ status: "complete", percent: 100 });
      return {
        fileUrl: audioUrl,
        metadata: {
          id,
          title: "Loading...",
          author: "Loading...",
          coverUrl: "",
          platform: "youtube",
          ...(storedMeta || {}),
          ...(preload || {}),
        },
      };
    }
  }

  onProgress({
    status: "fetching",
    percent: 0,
    message: "Fetching video info...",
  });

  // Get cookies based on user preference
  const { cookies } = await getCookiesToUse();

  return new Promise((resolve, reject) => {
    const controller = new AbortController();

    // Link external abort signal if provided
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => controller.abort());
    }

    fetch("/api/yt/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, cookies }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to start download");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        const processStream = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));

                  switch (data.type) {
                    case "status":
                      onProgress({
                        status: "fetching",
                        percent: 0,
                        message: data.message,
                      });
                      break;

                    case "metadata":
                      // Update metadata but keep downloading
                      break;

                    case "progress":
                      onProgress({
                        status:
                          data.status === "processing"
                            ? "processing"
                            : "downloading",
                        percent: data.percent || 0,
                        speed: data.speed,
                        eta: data.eta,
                        message: data.message,
                      });
                      break;

                    case "complete":
                      onProgress({ status: "complete", percent: 100 });

                      // Convert base64 back to blob
                      const binaryString = atob(data.data);
                      const bytes = new Uint8Array(binaryString.length);
                      for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                      }
                      const blob = new Blob([bytes], {
                        type: data.contentType,
                      });
                      const blobUrl = URL.createObjectURL(blob);

                      const metadata = {
                        id: getYouTubeId(url),
                        title: data.title,
                        author: data.author,
                        coverUrl: data.thumbnail,
                        platform: "youtube" as const,
                      };

                      // Cache the media
                      if (metadata.id) {
                        const cacheKey = data.videoMode
                          ? `yt:${metadata.id}:video`
                          : `yt:${metadata.id}:audio`;
                        setMedia(cacheKey, blob).catch(() => {});
                        setMeta(`yt:${metadata.id}`, metadata).catch(() => {});
                      }

                      resolve({
                        fileUrl: blobUrl,
                        videoUrl: data.videoMode ? blobUrl : undefined,
                        metadata,
                      });
                      return;

                    case "error":
                      reject(new Error(data.message));
                      return;
                  }
                } catch (e) {
                  console.error("Failed to parse SSE message:", e);
                }
              }
            }
          }
        };

        processStream().catch(reject);
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          return; // Ignore abort errors
        }
        reject(err);
      });
  });
}

export default function InitialPlayer({
  youtubeId,
  isShorts,
  metadata,
}: InitialPlayerProps) {
  const router = useRouter();
  const posthog = usePostHog();

  const [song, setSong] = useAtom(songAtom);
  const [isPlayer, setIsPlayer] = useState(false);
  const [noSleepEnabled, setNoSleepEnabled] = useNoSleep();
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: "idle",
    percent: 0,
  });

  // Ref to prevent double-call in React Strict Mode
  const downloadStarted = useRef(false);

  const isLoading = !song;

  useEffect(() => {
    // Prevent double-call in dev mode (React Strict Mode)
    if (downloadStarted.current) {
      return;
    }

    if (!youtubeId) {
      notifications.show({
        title: "Error",
        message: "No YouTube ID provided.",
      });
      router.push("/");
      return;
    }

    downloadStarted.current = true;

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
      return;
    }

    (setSong as (song: Song | null) => void)(null);
    setIsPlayer(false);
    setDownloadState({ status: "idle", percent: 0 });

    const abortController = new AbortController();

    downloadWithProgress(
      url,
      metadata,
      setDownloadState,
      abortController.signal,
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
  }, [youtubeId, isShorts, router, posthog, setSong, metadata]);

  const handleGoToPlayer = () => {
    setIsPlayer(true);
    if (!noSleepEnabled) {
      setNoSleepEnabled(true);
    }
  };

  if (isPlayer && song) {
    return <Player song={song} repeating={isShorts} />;
  }

  const getStatusText = () => {
    switch (downloadState.status) {
      case "fetching":
        return downloadState.message || "Fetching video info...";
      case "downloading":
        if (
          downloadState.percent > 0 &&
          downloadState.speed &&
          downloadState.eta
        ) {
          return `Downloading: ${downloadState.percent.toFixed(1)}% • ${downloadState.speed} • ETA: ${downloadState.eta}`;
        }
        if (downloadState.percent > 0) {
          return `Downloading: ${downloadState.percent.toFixed(1)}%`;
        }
        return "Starting download...";
      case "processing":
        return downloadState.message || "Processing media...";
      case "complete":
        return "Download complete!";
      case "error":
        return downloadState.message || "Download failed";
      default:
        return "Preparing...";
    }
  };

  // Determine if progress bar should be indeterminate (striped + animated)
  const isIndeterminate =
    downloadState.status === "fetching" ||
    downloadState.status === "processing" ||
    downloadState.status === "idle" ||
    (downloadState.status === "downloading" && downloadState.percent === 0);

  return (
    <Container size="xs">
      <Flex
        h="100dvh"
        align="stretch"
        justify="center"
        gap="md"
        direction="column"
      >
        <Flex gap={6} align="center" mb="sm">
          <Icon size={18} />
          <Text
            fz={rem(20)}
            fw="bold"
            lts={rem(0.2)}
            style={{
              userSelect: "none",
            }}
          >
            Moonlit
          </Text>
        </Flex>
        <Text weight={600} color="dimmed">
          Video Details
        </Text>
        <Flex gap="md" align="center">
          <Image
            src={metadata.coverUrl}
            radius="sm"
            height={48}
            width={48}
            withPlaceholder
            placeholder={
              <Center>
                <IconMusic />
              </Center>
            }
            alt="cover image"
          />
          <Flex direction="column">
            <Text weight={600}>{metadata.title || "Loading..."}</Text>
            <Text>{metadata.author || "Loading..."}</Text>
          </Flex>
        </Flex>

        {isLoading ? (
          <Flex direction="column" gap="sm">
            <Progress
              value={isIndeterminate ? 100 : downloadState.percent}
              size="lg"
              radius="xl"
              striped={isIndeterminate}
              animate={isIndeterminate}
              color={downloadState.status === "error" ? "red" : "violet"}
            />
            <Text size="sm" color="dimmed" align="center">
              {getStatusText()}
            </Text>
          </Flex>
        ) : (
          <Button onClick={handleGoToPlayer}>Play</Button>
        )}
      </Flex>
    </Container>
  );
}
