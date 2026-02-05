"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Center,
  Container,
  Flex,
  Group,
  Image,
  Modal,
  Paper,
  Progress,
  SegmentedControl,
  Switch,
  Text,
  rem,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconMusic } from "@tabler/icons-react";
import Icon from "@/components/Icon";
import { Player } from "@/components/Player";
import { useAppContext } from "@/context/AppContext";
import { useMediaDownloader } from "@/hooks/useMediaDownloader";
import useNoSleep from "@/hooks/useNoSleep";
import { HistoryItem, Media } from "@/interfaces";
import { getPlatform, getTikTokId, getYouTubeId, isYoutubeURL } from "@/utils";
import { getMedia } from "@/utils/cache";

interface InitialPlayerProps {
  url?: string;
  metadata?: Partial<Media["metadata"]>;
  duration?: number;
  isLocalFile?: boolean; // Deprecated but kept for compatibility during transition if needed
}

export default function InitialPlayer({
  url,
  metadata,
  duration,
  isLocalFile = false,
}: InitialPlayerProps) {
  const router = useRouter();
  const { media, history, setHistory } = useAppContext();
  const [isPlayer, setIsPlayer] = useState(false);
  const [noSleepEnabled, noSleepControls] = useNoSleep();

  const { downloadState, startDownload } = useMediaDownloader(url || "", metadata || {});

  const [confirmationOpened, setConfirmationOpened] = useState(false);
  const [includeVideo, setIncludeVideo] = useState(false);
  const [quality, setQuality] = useState<"low" | "high">("low");

  const downloadStarted = useRef(false);
  const isLoading = !media;
  const isYouTube = url ? isYoutubeURL(url) : false;

  // Handle local file mode - redirect if no media
  useEffect(() => {
    if (isLocalFile && (!media || getPlatform(media.sourceUrl) !== "local")) {
      router.replace("/");
    }
  }, [isLocalFile, media, router]);

  // Handle URL-based download
  useEffect(() => {
    if (isLocalFile || downloadStarted.current) return;
    if (!url) {
      notifications.show({ title: "Error", message: "No URL provided." });
      router.push("/");
      return;
    }

    downloadStarted.current = true;

    async function checkAndStart() {
      // Check cache
      let videoKey: string | null = null;
      let audioKey: string | null = null;

      if (isYouTube) {
        const id = getYouTubeId(url!);
        if (id) {
          videoKey = `yt:${id}:video`;
          audioKey = `yt:${id}:audio`;
        }
      } else {
        const id = getTikTokId(url!);
        if (id) {
          videoKey = `tt:${id}:video`;
        }
      }

      const cachedVideo = videoKey ? await getMedia(videoKey) : null;
      const cachedAudio = audioKey ? await getMedia(audioKey) : null;

      if (cachedVideo || cachedAudio) {
        startDownload(undefined, "high");
        return;
      }

      // If duration > 10 mins (YouTube), ask permission
      if (isYouTube && duration && duration > 600) {
        setConfirmationOpened(true);
      } else {
        startDownload(true, "high");
      }
    }

    checkAndStart();
  }, [url, duration, router, startDownload, isYouTube, isLocalFile]);

  const handleGoToPlayer = () => {
    setIsPlayer(true);
    if (!noSleepEnabled) {
      noSleepControls.enable();
    }

    // Add to history (works for both URL and local files)
    if (media) {
      // For local files, videoUrl is no longer used, sourceUrl is the key
      const historyUrl = url || media.sourceUrl;

      setHistory((prev) => {
        const filtered = prev.filter((item) => item.sourceUrl !== historyUrl);
        const newItem: HistoryItem = {
          ...media,
          playedAt: Date.now(),
          sourceUrl: historyUrl,
        };
        return [newItem, ...filtered].slice(0, 50);
      });
    }
  };

  // Show player
  if (isPlayer && media) {
    const isShortForm = isLocalFile ? false : !isYouTube || url?.includes("/shorts/");
    return <Player key={media.fileUrl} media={media} repeating={isShortForm} />;
  }

  // Local file mode - waiting for user to click play
  if (isLocalFile) {
    if (!media) return null;

    return (
      <Container size="xs">
        <Flex h="100dvh" align="stretch" justify="center" gap="md" direction="column">
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <Flex gap={12} align="center" mb="sm">
              <Icon size={18} />
              <Text fz={rem(20)} fw="bold" lts={rem(0.2)} style={{ userSelect: "none" }}>
                Moonlit
              </Text>
            </Flex>
          </Link>
          <Text weight={600} color="dimmed">
            Local File
          </Text>
          <Flex gap="md" align="center">
            <Image
              src={media.metadata.coverUrl}
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
              <Text weight={600}>{media.metadata.title}</Text>
              <Text>
                {media.metadata.artist ?? media.metadata.author}
                {media.metadata.album && ` · ${media.metadata.album}`}
              </Text>
            </Flex>
          </Flex>
          <Button onClick={handleGoToPlayer}>Play</Button>
        </Flex>
      </Container>
    );
  }

  // URL mode - download screen
  const displayMetadata = metadata || {};

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

  return (
    <Container size="xs">
      <Modal
        opened={confirmationOpened}
        onClose={() => router.push("/")}
        title="Big file detected"
        centered
      >
        <Text size="sm" mb="md">
          This video is longer than 10 minutes. Do you want to continue downloading?
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
              { label: "High Quality (720p)", value: "high" },
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

      <Flex h="100dvh" align="stretch" justify="center" gap="md" direction="column">
        <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <Flex gap={12} align="center" mb="sm">
            <Icon size={18} />
            <Text fz={rem(20)} fw="bold" lts={rem(0.2)} style={{ userSelect: "none" }}>
              Moonlit
            </Text>
          </Flex>
        </Link>
        <Text weight={600} color="dimmed">
          Video Details
        </Text>
        <Flex gap="md" align="center">
          <Image
            src={displayMetadata.coverUrl}
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
            <Text weight={600}>{displayMetadata.title || "Loading..."}</Text>
            <Text>{displayMetadata.author || "Loading..."}</Text>
          </Flex>
        </Flex>

        {downloadState.status === "error" ? (
          <Paper
            p="md"
            radius="md"
            withBorder
            style={{ borderColor: "var(--mantine-color-red-3)" }}
          >
            <Flex direction="column" gap="md">
              <Alert
                icon={<IconAlertCircle size={20} />}
                title="Download failed"
                color="red"
                variant="light"
              >
                <Text
                  size="sm"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {downloadState.message || "Something went wrong."}
                </Text>
                <Text size="sm" color="dimmed" mt="xs">
                  Try configuring cookies from a logged-in account in the app settings if
                  the problem persists.
                </Text>
              </Alert>
              <Flex gap="xs">
                <Button
                  variant="light"
                  color="red"
                  fullWidth
                  onClick={() => router.push("/")}
                >
                  Go home
                </Button>
                <Button
                  variant="filled"
                  fullWidth
                  onClick={() => startDownload(true, "high")}
                >
                  Try again
                </Button>
              </Flex>
            </Flex>
          </Paper>
        ) : isLoading ? (
          <Flex direction="column" gap="sm">
            <Progress
              value={isIndeterminate ? 100 : downloadState.percent}
              size="lg"
              radius="xl"
              striped={isIndeterminate}
              animate={isIndeterminate}
              color="violet"
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
