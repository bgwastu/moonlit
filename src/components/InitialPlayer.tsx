"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
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
  Text,
  Tooltip,
  rem,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCookie,
  IconHistory,
  IconMusic,
  IconTrash,
} from "@tabler/icons-react";
import CookiesModal from "@/components/CookiesModal";
import HistoryModal from "@/components/HistoryModal";
import Icon from "@/components/Icon";
import LoadingOverlay from "@/components/LoadingOverlay";
import { Player } from "@/components/Player";
import ResetModal from "@/components/ResetModal";
import { useAppContext } from "@/context/AppContext";
import { HistoryItem, Media } from "@/interfaces";
import { getPlatform, isSupportedURL, isYoutubeURL } from "@/utils";
import { StreamState, streamWithProgress } from "@/utils/streamer";

interface InitialPlayerProps {
  url?: string;
  metadata?: Partial<Media["metadata"]>;
  duration?: number;
  metadataLoadError?: string;
}

export default function InitialPlayer({
  url,
  metadata,
  duration,
  metadataLoadError,
}: InitialPlayerProps) {
  const router = useRouter();
  const { media, history, setHistory, setMedia } = useAppContext();
  const [isPlayer, setIsPlayer] = useState(false);

  // For URL-based mode: stream state + start stream logic (inlined useMediaStreamer)
  const [streamState, setStreamState] = useState<StreamState>({ status: "idle" });
  const [confirmationOpened, setConfirmationOpened] = useState(false);

  const isLocalMode = !url;
  const streamStarted = useRef(false);

  // Modal states (shared between modes)
  const [cookiesOpened, setCookiesOpened] = useState(false);
  const [historyOpened, setHistoryOpened] = useState(false);
  const [resetOpened, setResetOpened] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isYouTube = url ? isYoutubeURL(url) : false;

  // Redirect if local mode but no media
  useEffect(() => {
    if (isLocalMode && !media) {
      router.replace("/");
    }
  }, [isLocalMode, media, router]);

  // Update document title
  useEffect(() => {
    if (media?.metadata?.title) {
      const prev = document.title;
      document.title = `${media.metadata.title} - Moonlit`;
      return () => {
        document.title = prev;
      };
    }
  }, [media?.metadata?.title]);

  // Inline useMediaStreamer logic
  const startStream = useCallback(() => {
    if (!url || !isSupportedURL(url)) {
      notifications.show({ title: "Error", message: "Invalid URL provided." });
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

    streamWithProgress(url, metadata || {}, updateStreamState, abortController.signal)
      .then((streamedMedia: Media) => {
        setMedia(streamedMedia);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        console.error("Stream error:", e);
        const message = e.message || "Could not process the media.";
        setStreamState({ status: "error", message });
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

  // Auto-start stream for URL mode
  useEffect(() => {
    if (isLocalMode || metadataLoadError || streamStarted.current) return;
    if (!url) {
      notifications.show({ title: "Error", message: "No URL provided." });
      router.push("/");
      return;
    }

    streamStarted.current = true;

    if (isYouTube && duration && duration > 600) {
      setTimeout(() => setConfirmationOpened(true), 0);
    } else {
      setTimeout(() => startStream(), 0);
    }
  }, [url, duration, router, startStream, isYouTube, metadataLoadError, isLocalMode]);

  const handleGoToPlayer = useCallback(() => {
    setIsPlayer(true);

    if (media) {
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.sourceUrl !== media.sourceUrl);
        const newItem: HistoryItem = { ...media, playedAt: Date.now() };
        return [newItem, ...filtered].slice(0, 50);
      });
    }
  }, [media, setHistory]);

  if (isPlayer && media) {
    const isShortForm = !isYouTube || url?.includes("/shorts/");
    return <Player key={media.fileUrl} media={media} repeating={isShortForm} />;
  }

  const displayMetadata = media?.metadata ?? metadata ?? {};
  const liveMetadata = streamState.metadata ?? displayMetadata;
  const hasMetadataContent =
    metadataLoadError ||
    media ||
    Boolean(displayMetadata.title) ||
    Boolean(liveMetadata.title);

  const getStatusText = () => {
    switch (streamState.status) {
      case "extracting":
        return streamState.message || "Extracting stream...";
      case "ready":
        return "Ready!";
      case "error":
        return streamState.message || "Stream failed";
      default:
        return "Preparing...";
    }
  };

  const isIndeterminate =
    streamState.status === "extracting" || streamState.status === "idle";

  return (
    <Container size="xs">
      <LoadingOverlay visible={historyLoading} message="Loading..." />
      <CookiesModal opened={cookiesOpened} onClose={() => setCookiesOpened(false)} />
      <HistoryModal
        opened={historyOpened}
        onClose={() => setHistoryOpened(false)}
        onLoadingStart={setHistoryLoading}
      />
      <ResetModal opened={resetOpened} onClose={() => setResetOpened(false)} />

      {!isLocalMode && (
        <Modal
          opened={confirmationOpened}
          onClose={() => router.push("/")}
          title="Big file detected"
          centered
        >
          <Text size="sm" mb="md">
            This video is longer than 10 minutes. Stream anyway?
          </Text>
          <Group position="right">
            <Button variant="default" onClick={() => router.push("/")}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmationOpened(false);
                startStream();
              }}
            >
              Stream
            </Button>
          </Group>
        </Modal>
      )}

      <Flex h="100dvh" align="stretch" justify="center" gap="md" direction="column">
        <Flex justify="space-between" align="center" mb="sm">
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <Flex gap={12} align="center">
              <Icon size={18} />
              <Text fz={rem(20)} fw="bold" lts={rem(0.2)} style={{ userSelect: "none" }}>
                Moonlit
              </Text>
            </Flex>
          </Link>
          {!isLocalMode && (
            <Group spacing="xs">
              <Tooltip label="Cookies Settings" position="bottom" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  onClick={() => setCookiesOpened(true)}
                >
                  <IconCookie size={20} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="History" position="bottom" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  onClick={() => setHistoryOpened(true)}
                >
                  <IconHistory size={20} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Reset Data" position="bottom" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="lg"
                  onClick={() => setResetOpened(true)}
                >
                  <IconTrash size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Flex>

        {hasMetadataContent && (
          <>
            <Text weight={600} color="dimmed">
              {isLocalMode ? "Local File" : "Video Details"}
            </Text>
            <Flex gap="md" align="center">
              <Image
                src={liveMetadata.coverUrl}
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
                <Text weight={600}>
                  {metadataLoadError ? "Video unavailable" : liveMetadata.title}
                </Text>
                {(liveMetadata.artist ?? liveMetadata.author) && (
                  <Text>
                    {liveMetadata.artist ?? liveMetadata.author}
                    {liveMetadata.album ? ` \u00b7 ${liveMetadata.album}` : ""}
                  </Text>
                )}
              </Flex>
            </Flex>
          </>
        )}

        {metadataLoadError ? (
          <Paper
            p="md"
            radius="md"
            withBorder
            style={{ borderColor: "var(--mantine-color-red-3)" }}
          >
            <Flex direction="column" gap="md">
              <Alert
                icon={<IconAlertCircle size={20} />}
                title="Video unavailable"
                color="red"
                variant="light"
              >
                <Text
                  size="sm"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {metadataLoadError}
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
                <Button variant="filled" fullWidth onClick={() => router.refresh()}>
                  Try again
                </Button>
              </Flex>
            </Flex>
          </Paper>
        ) : streamState.status === "error" ? (
          <Paper
            p="md"
            radius="md"
            withBorder
            style={{ borderColor: "var(--mantine-color-red-3)" }}
          >
            <Flex direction="column" gap="md">
              <Alert
                icon={<IconAlertCircle size={20} />}
                title="Stream failed"
                color="red"
                variant="light"
              >
                <Text
                  size="sm"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {streamState.message || "Something went wrong."}
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
                <Button variant="filled" fullWidth onClick={() => startStream()}>
                  Try again
                </Button>
              </Flex>
            </Flex>
          </Paper>
        ) : !isLocalMode && url && !media ? (
          <Flex direction="column" gap="sm">
            <Progress
              value={100}
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
