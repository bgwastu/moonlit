"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Flex,
  Group,
  Modal,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconHistory, IconPlayerPlay, IconTrash, IconX } from "@tabler/icons-react";
import { useAppContext } from "@/context/AppContext";
import { HistoryItem, Media } from "@/interfaces";
import { getPlatform, getTikTokCreatorAndVideoId, getYouTubeId, timeAgo } from "@/utils";
import { getMedia } from "@/utils/cache";

interface HistoryModalProps {
  opened: boolean;
  onClose: () => void;
}

export default function HistoryModal({ opened, onClose }: HistoryModalProps) {
  const { history, setHistory, setMedia } = useAppContext();
  const router = useRouter();
  const theme = useMantineTheme();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const handlePlay = async (item: HistoryItem) => {
    onClose();

    const platform = getPlatform(item.sourceUrl);

    // Check if it's a local file
    if (platform === "local") {
      try {
        const key = item.sourceUrl;
        if (!key) throw new Error("No source URL found for local file");

        const blob = await getMedia(key);
        if (!blob) {
          alert("File not found in storage. It may have been cleared.");
          return;
        }

        const blobUrl = URL.createObjectURL(blob);
        const media: Media = {
          ...item,
          fileUrl: blobUrl,
          sourceUrl: key,
          metadata: { ...item.metadata },
        };

        setMedia(media);
        router.push("/player");
      } catch (e) {
        console.error(e);
        alert("Failed to load local file.");
      }
      return;
    }

    // For remote files, navigate using platform-specific URL schema
    if (platform === "youtube") {
      const id = getYouTubeId(item.sourceUrl);
      if (id) {
        router.push(`/watch?v=${id}`);
        return;
      }
    } else if (platform === "tiktok") {
      const { creator, videoId } = getTikTokCreatorAndVideoId(item.sourceUrl);
      if (creator && videoId) {
        router.push(`/@${creator}/video/${videoId}`);
        return;
      }
    }

    // Fallback - shouldn't normally reach here
    console.warn("Could not parse URL for history item:", item.sourceUrl);
  };

  const clearHistory = () => {
    if (confirm("Are you sure you want to clear your history?")) {
      setHistory([]);
    }
  };

  const removeItem = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    setHistory((prev) => prev.filter((item) => item.sourceUrl !== url));
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
                  .map((item, index) => {
                    const itemKey = item.sourceUrl;
                    const isHovered = hoveredItem === itemKey;
                    return (
                      <Box
                        key={itemKey}
                        onClick={() => handlePlay(item)}
                        onMouseEnter={() => setHoveredItem(itemKey)}
                        onMouseLeave={() => setHoveredItem(null)}
                        sx={(theme) => ({
                          cursor: "pointer",
                          display: "block",
                          width: "100%",
                          padding: theme.spacing.sm,
                          borderRadius: theme.radius.md,
                          backgroundColor:
                            theme.colorScheme === "dark"
                              ? theme.colors.dark[7]
                              : theme.colors.gray[0],
                          border: `1px solid ${theme.colorScheme === "dark" ? "transparent" : theme.colors.gray[2]}`,
                          transition: "all 0.2s ease",

                          "&:hover": {
                            backgroundColor:
                              theme.colorScheme === "dark"
                                ? theme.colors.dark[6]
                                : theme.white,
                            transform: "translateY(-2px)",
                            boxShadow: theme.shadows.sm,
                          },
                        })}
                      >
                        <Flex
                          align="center"
                          gap="sm"
                          w="100%"
                          style={{ overflow: "hidden" }}
                        >
                          <Box style={{ position: "relative", flexShrink: 0 }}>
                            <Avatar
                              src={item.metadata.coverUrl}
                              size={60}
                              radius="md"
                              styles={{ image: { objectFit: "cover" } }}
                            />
                            {isHovered && (
                              <Box
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  background: "rgba(0,0,0,0.4)",
                                  borderRadius: theme.radius.md,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <IconPlayerPlay
                                  size={24}
                                  color="white"
                                  style={{ opacity: 0.9 }}
                                />
                              </Box>
                            )}
                          </Box>

                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" weight={600} truncate mb={2}>
                              {item.metadata.title}
                            </Text>
                            <Group spacing={6} noWrap>
                              <Text
                                size="xs"
                                color="dimmed"
                                truncate
                                style={{ maxWidth: 200 }}
                              >
                                {item.metadata.artist ?? item.metadata.author}
                                {item.metadata.album && ` · ${item.metadata.album}`}
                              </Text>
                              <Text size="xs" color="dimmed" style={{ flexShrink: 0 }}>
                                •
                              </Text>
                              <Text
                                size="xs"
                                color="dimmed"
                                transform="capitalize"
                                truncate
                              >
                                {getPlatform(item.sourceUrl)}
                              </Text>
                            </Group>
                          </Box>

                          <Stack align="flex-end" spacing={4} style={{ flexShrink: 0 }}>
                            <Text
                              size="xs"
                              color="dimmed"
                              style={{ whiteSpace: "nowrap" }}
                            >
                              {timeAgo(item.playedAt)}
                            </Text>

                            <Tooltip label="Remove from history" openDelay={500}>
                              <ActionIcon
                                size="sm"
                                color="red"
                                variant="subtle"
                                className="delete-btn"
                                onClick={(e) => removeItem(e, itemKey!)}
                                style={{
                                  opacity: isHovered ? 1 : 0,
                                  transition: "opacity 0.2s ease",
                                }}
                              >
                                <IconX size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Stack>
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
                borderTop: `1px solid ${theme.colorScheme === "dark" ? theme.colors.dark[6] : theme.colors.gray[2]}`,
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
