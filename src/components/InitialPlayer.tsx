"use client";

import { useEffect, useRef, useState } from "react";
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
import { useMediaStreamer } from "@/hooks/useMediaStreamer";
import { HistoryItem, Media } from "@/interfaces";
import { isYoutubeURL } from "@/utils";

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
  const { media, history, setHistory } = useAppContext();
  const [isPlayer, setIsPlayer] = useState(false);

  const { streamState, startStream } = useMediaStreamer(url || "", metadata || {});

  const [confirmationOpened, setConfirmationOpened] = useState(false);
  const [cookiesOpened, setCookiesOpened] = useState(false);
  const [historyOpened, setHistoryOpened] = useState(false);
  const [resetOpened, setResetOpened] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const streamStarted = useRef(false);
  const isLoading = !media;
  const isYouTube = url ? isYoutubeURL(url) : false;

  useEffect(() => {
    if (media?.metadata?.title) {
      const prev = document.title;
      document.title = `${media.metadata.title} - Moonlit`;
      return () => {
        document.title = prev;
      };
    }
  }, [media?.metadata?.title]);

  useEffect(() => {
    if (metadataLoadError || streamStarted.current) return;
    if (!url) {
      notifications.show({ title: "Error", message: "No URL provided." });
      router.push("/");
      return;
    }

    streamStarted.current = true;

    if (isYouTube && duration && duration > 600) {
      setTimeout(() => setConfirmationOpened(true), 0);
    } else {
      startStream();
    }
  }, [url, duration, router, startStream, isYouTube, metadataLoadError]);

  const handleGoToPlayer = () => {
    setIsPlayer(true);

    if (media) {
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
        </Flex>
        {hasMetadataContent && (
          <>
            <Text weight={600} color="dimmed">
              Video Details
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
                <Text>
                  {liveMetadata.artist ?? liveMetadata.author ?? "\u2014"}
                  {liveMetadata.album ? ` \u00b7 ${liveMetadata.album}` : ""}
                </Text>
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
        ) : isLoading ? (
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
