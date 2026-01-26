"use client";

import useNoSleep from "@/hooks/useNoSleep";
import { useMediaDownloader } from "@/hooks/useMediaDownloader";
import { Song } from "@/interfaces";
import {
  getSongLength,
  getTikTokId,
  getYouTubeId,
  isYoutubeURL,
} from "@/utils";
import { getMedia } from "@/utils/cache";
import { songAtom } from "@/state";
import {
  Button,
  Center,
  Container,
  Flex,
  Group,
  Image,
  Modal,
  Progress,
  SegmentedControl,
  Switch,
  Text,
  rem,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMusic } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import Icon from "@/components/Icon";
import { Player } from "@/components/Player";

import { getDominantColorFromImage } from "@/hooks/useDominantColor";

interface UnifiedPlayerProps {
  url: string;
  metadata: Partial<Song["metadata"]>;
  duration?: number;
}

export default function UnifiedPlayer({
  url,
  metadata,
  duration,
}: UnifiedPlayerProps) {
  const router = useRouter();
  const [song] = useAtom(songAtom);
  const [isPlayer, setIsPlayer] = useState(false);
  const [noSleepEnabled, setNoSleepEnabled] = useNoSleep();
  const [dominantColor, setDominantColor] = useState<string>("rgba(0,0,0,0)");

  const { downloadState, startDownload } = useMediaDownloader(url, metadata);

  const [confirmationOpened, setConfirmationOpened] = useState(false);
  const [includeVideo, setIncludeVideo] = useState(false);
  const [quality, setQuality] = useState<"low" | "high">("low");

  const downloadStarted = useRef(false);
  const isLoading = !song;
  const isYouTube = isYoutubeURL(url);

  useEffect(() => {
    if (downloadStarted.current) return;
    if (!url) {
      notifications.show({ title: "Error", message: "No URL provided." });
      router.push("/");
      return;
    }

    downloadStarted.current = true;

    async function checkAndStart() {
      // Determine IDs and Keys for cache checking
      let videoKey: string | null = null;
      let audioKey: string | null = null;

      if (isYouTube) {
        const id = getYouTubeId(url);
        if (id) {
          videoKey = `yt:${id}:video`;
          audioKey = `yt:${id}:audio`;
        }
      } else {
        const id = getTikTokId(url);
        if (id) {
          videoKey = `tt:${id}:video`;
          // TikTok usually uses one key for video, but we can check standard pattern
        }
      }

      const cachedVideo = videoKey ? await getMedia(videoKey) : null;
      const cachedAudio = audioKey ? await getMedia(audioKey) : null;

      if (cachedVideo || cachedAudio) {
        startDownload(undefined, "high");
        return;
      }

      // If duration > 10 mins (YouTube only mostly), ask permission
      if (isYouTube && duration && duration > 600) {
        setConfirmationOpened(true);
      } else {
        // Default behavior: download video for tiktok, high quality audio for YT
        // Actually, previous logic was: startDownload(true, "high")
        // But for YouTube we default to audio+video?
        // InitialPlayer code: startDownload(true, "high");
        // We likely want video by default if possible.
        startDownload(true, "high");
      }
    }

    checkAndStart();
  }, [url, duration, router, startDownload, isYouTube]);

  // Extract Dominant Color
  useEffect(() => {
    if (!metadata.coverUrl) return;
    const img = document.createElement("img");
    img.crossOrigin = "Anonymous";
    // Use high res for better color extraction if available, though original is fine too.
    // For preview, usage of original is okay if small, but let's try to extract from the one we will use?
    // Actually, extraction from small image is faster. Let's keep using metadata.coverUrl for extraction
    // unless we strictly want to match the Player's high-res one.
    // But since the user complained about "shit on preview", we should update the Image component src below too.

    img.src =
      metadata.coverUrl?.replace(/(hq|mq|sd)?default/, "maxresdefault") ||
      metadata.coverUrl;
    img.onload = () => {
      const color = getDominantColorFromImage(img);
      setDominantColor(color);
    };
  }, [metadata.coverUrl]);

  const handleGoToPlayer = () => {
    setIsPlayer(true);
    if (!noSleepEnabled) {
      setNoSleepEnabled(true);
    }
  };

  if (isPlayer && song) {
    // For Shorts/TikTok, we might want repeating=true by default
    const isShortForm = !isYouTube || url.includes("/shorts/");
    return (
      <Player
        song={song}
        repeating={isShortForm}
        initialDominantColor={dominantColor}
      />
    );
  }

  const getStatusText = () => {
    switch (downloadState.status) {
      case "fetching":
        return downloadState.message || "Fetching info...";
      case "downloading":
        if (downloadState.percent > 0) {
          let text = `Downloading: ${downloadState.percent.toFixed(1)}%`;
          if (downloadState.speed) text += ` • ${downloadState.speed}`;
          if (downloadState.eta) text += ` • ETA: ${downloadState.eta}`;
          return text;
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

  const isIndeterminate =
    downloadState.status === "fetching" ||
    downloadState.status === "processing" ||
    downloadState.status === "idle" ||
    (downloadState.status === "downloading" && downloadState.percent === 0);

  downloadState.status === "downloading" && downloadState.percent === 0;

  return (
    <>
      <Container size="xs">
        <Modal
          opened={confirmationOpened}
          onClose={() => router.push("/")}
          title="Big file detected"
          centered
        >
          <Text size="sm" mb="md">
            This video is longer than 10 minutes. Do you want to continue
            downloading?
          </Text>
          <Switch
            label="Include Video (Larger file size)"
            checked={includeVideo}
            onChange={(event) => setIncludeVideo(event.currentTarget.checked)}
            mb="sm"
          />
          {includeVideo && (
            <SegmentedControl
              value={quality}
              onChange={(value) => setQuality(value as "low" | "high")}
              data={[
                { label: "Low Quality (480p)", value: "low" },
                { label: "High Quality (HD)", value: "high" },
              ]}
              mb="xl"
              fullWidth
            />
          )}
          <Group position="right">
            <Button variant="default" onClick={() => router.push("/")}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmationOpened(false);
                startDownload(includeVideo, quality);
              }}
            >
              Download
            </Button>
          </Group>
        </Modal>

        <Flex
          h="100dvh"
          align="stretch"
          justify="center"
          gap="md"
          direction="column"
        >
          <Flex gap={12} align="center" mb="sm">
            <Icon size={18} />
            <Text
              fz={rem(20)}
              fw="bold"
              lts={rem(0.2)}
              style={{ userSelect: "none" }}
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
    </>
  );
}
