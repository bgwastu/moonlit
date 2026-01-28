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
import { IconHistory, IconPlayerPlay, IconTrash, IconX } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { historyAtom } from "@/state";

interface HistoryModalProps {
  opened: boolean;
  onClose: () => void;
}

const timeAgo = (date: number) => {
  const seconds = Math.floor((Date.now() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m";
  return "now";
};

export default function HistoryModal({ opened, onClose }: HistoryModalProps) {
  const [history, setHistory] = useAtom(historyAtom);
  const router = useRouter();
  const theme = useMantineTheme();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const handlePlay = (url: string) => {
    onClose();
    router.push(`/player?url=${encodeURIComponent(url)}`);
  };

  const clearHistory = () => {
    if (confirm("Are you sure you want to clear your history?")) {
      setHistory([]);
    }
  };

  const removeItem = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    setHistory((prev) => prev.filter((item) => item.originalUrl !== url));
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
                {history.map((item) => {
                  const isHovered = hoveredItem === item.originalUrl;
                  return (
                    <UnstyledButton
                      key={item.originalUrl + item.playedAt}
                      onClick={() => handlePlay(item.originalUrl)}
                      onMouseEnter={() => setHoveredItem(item.originalUrl)}
                      onMouseLeave={() => setHoveredItem(null)}
                      sx={(theme) => ({
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
                              {item.metadata.author}
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
                              {item.metadata.platform}
                            </Text>
                          </Group>
                        </Box>

                        <Stack align="flex-end" spacing={4} style={{ flexShrink: 0 }}>
                          <Text size="xs" color="dimmed" style={{ whiteSpace: "nowrap" }}>
                            {timeAgo(item.playedAt)}
                          </Text>

                          <Tooltip label="Remove from history" openDelay={500}>
                            <ActionIcon
                              size="sm"
                              color="red"
                              variant="subtle"
                              className="delete-btn"
                              onClick={(e) => removeItem(e, item.originalUrl)}
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
                    </UnstyledButton>
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
