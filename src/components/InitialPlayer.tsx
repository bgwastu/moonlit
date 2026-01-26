"use client";

import useNoSleep from "@/hooks/useNoSleep";
import { useMediaDownloader } from "@/hooks/useMediaDownloader";
import { Song } from "@/interfaces";
import { songAtom } from "@/state";
import { getMedia } from "@/utils/cache";
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
import { usePostHog } from "posthog-js/react";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Player } from "./Player";

interface InitialPlayerProps {
  youtubeId: string;
  isShorts: boolean;
  metadata: Partial<Song["metadata"]>;
  duration?: number;
}

export default function InitialPlayer({
  youtubeId,
  isShorts,
  metadata,
  duration,
}: InitialPlayerProps) {
  const router = useRouter();
  const posthog = usePostHog();

  const [song] = useAtom(songAtom);
  const [isPlayer, setIsPlayer] = useState(false);
  const [noSleepEnabled, setNoSleepEnabled] = useNoSleep();

  const { downloadState, startDownload } = useMediaDownloader(
    youtubeId,
    isShorts,
    metadata,
  );

  const [confirmationOpened, setConfirmationOpened] = useState(false);
  const [includeVideo, setIncludeVideo] = useState(false);
  const [quality, setQuality] = useState<"low" | "high">("low");

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

    async function checkAndStart() {
      // Check cache first
      const videoKey = `yt:${youtubeId}:video`;
      const audioKey = `yt:${youtubeId}:audio`;
      const cachedVideo = await getMedia(videoKey);
      const cachedAudio = await getMedia(audioKey);

      if (cachedVideo || cachedAudio) {
        // If cached, just proceed, downloadWithProgress will handle it fast
        startDownload(undefined, "high");
        return;
      }

      // If not cached and duration > 600 (10 mins), ask permission
      if (duration && duration > 600) {
        setConfirmationOpened(true);
      } else {
        startDownload(true, "high");
      }
    }

    checkAndStart();
  }, [youtubeId, duration, router, startDownload]);

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
