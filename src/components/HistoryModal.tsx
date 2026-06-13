"use client";

import { useRouter } from "next/navigation";
import {
  Avatar,
  Box,
  Button,
  Flex,
  Group,
  Modal,
  Stack,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { IconHistory, IconTrash } from "@tabler/icons-react";
import { useAppContext } from "@/context/AppContext";
import { HistoryItem, Media } from "@/interfaces";
import { getPlatform, getYouTubeId, timeAgo } from "@/utils";
import { getMedia } from "@/utils/cache";

interface HistoryModalProps {
  opened: boolean;
  onClose: () => void;
  onLoadingStart: (loading: boolean) => void;
}

export default function HistoryModal({
  opened,
  onClose,
  onLoadingStart,
}: HistoryModalProps) {
  const { history, setHistory, setMedia } = useAppContext();
  const router = useRouter();
  const theme = useMantineTheme();

  const handlePlay = async (item: HistoryItem) => {
    onClose();
    onLoadingStart(true);

    const platform = getPlatform(item.sourceUrl);

    if (platform === "local") {
      try {
        const key = item.sourceUrl;
        if (!key) throw new Error("No source URL found for local file");

        const blob = await getMedia(key);
        if (!blob) {
          alert("File not found in storage. It may have been cleared.");
          onLoadingStart(false);
          return;
        }

        const blobUrl = URL.createObjectURL(blob);
        const media: Media = {
          ...item,
          fileUrl: blobUrl,
          sourceUrl: key,
          metadata: { ...(item.metadata ?? {}) } as Media["metadata"],
        };

        setMedia(media);
        router.push("/player");
      } catch (e) {
        console.error(e);
        alert("Failed to load local file.");
        onLoadingStart(false);
      }
      return;
    }

    if (platform === "youtube") {
      const id = getYouTubeId(item.sourceUrl);
      if (id) {
        router.push(`/watch?v=${id}`);
        return;
      }
    } else if (platform === "direct") {
      router.push(`/player?url=${encodeURIComponent(item.sourceUrl)}`);
      return;
    }

    console.warn("Could not parse URL for history item:", item.sourceUrl);
    onLoadingStart(false);
  };

  const clearHistory = () => {
    if (confirm("Are you sure you want to clear your history?")) {
      setHistory([]);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group spacing="xs">
          <IconHistory size={20} />
          <Text size="lg" weight={700}>
            History
          </Text>
          {history.length > 0 && (
            <Text color="dimmed" size="xs">
              ({history.length})
            </Text>
          )}
        </Group>
      }
      size="lg"
      radius="md"
      centered
      padding="lg"
    >
      <Stack spacing="md" h={500} style={{ display: "flex", flexDirection: "column" }}>
        {history.length === 0 ? (
          <Flex
            h="100%"
            align="center"
            justify="center"
            direction="column"
            gap="md"
            style={{ opacity: 0.5 }}
          >
            <IconHistory size={64} stroke={1.5} />
            <Text size="lg" weight={500}>
              No history yet
            </Text>
            <Text size="sm" color="dimmed">
              Songs you play will appear here
            </Text>
          </Flex>
        ) : (
          <>
            <Box h="100%" style={{ flex: 1, overflowY: "auto" }}>
              <Stack spacing="xs" pr="xs">
                {history
                  .sort((a, b) => b.playedAt - a.playedAt)
                  .map((item) => {
                    const meta = item.metadata ?? ({} as Media["metadata"]);
                    return (
                      <Box
                        key={item.sourceUrl}
                        onClick={() => handlePlay(item)}
                        sx={{
                          cursor: "pointer",
                          display: "block",
                          width: "100%",
                          padding: theme.spacing.sm,
                          borderRadius: theme.radius.md,
                          backgroundColor: theme.colors.dark[7],
                          "&:hover": {
                            backgroundColor: theme.colors.dark[6],
                          },
                        }}
                      >
                        <Flex
                          align="center"
                          gap="sm"
                          w="100%"
                          style={{ overflow: "hidden" }}
                        >
                          <Avatar
                            src={meta.coverUrl}
                            size={40}
                            radius="md"
                            styles={{ image: { objectFit: "cover" } }}
                          />
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" weight={600} truncate>
                              {meta.title}
                            </Text>
                            <Text size="xs" color="dimmed" truncate>
                              {meta.artist ?? meta.author}
                              {meta.album && ` · ${meta.album}`}
                            </Text>
                          </Box>
                          <Text
                            size="xs"
                            color="dimmed"
                            style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            {timeAgo(item.playedAt)}
                          </Text>
                          <Text
                            size="xs"
                            color="dimmed"
                            transform="capitalize"
                            style={{ flexShrink: 0, width: 60, textAlign: "right" }}
                          >
                            {getPlatform(item.sourceUrl)}
                          </Text>
                        </Flex>
                      </Box>
                    );
                  })}
              </Stack>
            </Box>

            <Flex
              justify="center"
              pt="xs"
              style={{
                borderTop: `1px solid ${theme.colors.dark[6]}`,
              }}
            >
              <Button
                variant="subtle"
                color="red"
                size="sm"
                compact
                leftIcon={<IconTrash size={14} />}
                onClick={clearHistory}
                disabled={history.length === 0}
              >
                Clear All History
              </Button>
            </Flex>
          </>
        )}
      </Stack>
    </Modal>
  );
}
