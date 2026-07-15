"use client";

import {
  Avatar,
  Box,
  Button,
  Center,
  Flex,
  Modal,
  Stack,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { IconMusic, IconTrash } from "@tabler/icons-react";
import { useAppContext } from "@/context/AppContext";
import { HistoryItem } from "@/interfaces";
import { timeAgo } from "@/utils";

interface HistoryModalProps {
  opened: boolean;
  onClose: () => void;
  onLoadingStart: (loading: boolean) => void;
}

export default function HistoryModal({ opened, onClose }: HistoryModalProps) {
  const { history, setHistory, openPlayer } = useAppContext();
  const theme = useMantineTheme();

  const handlePlay = (item: HistoryItem) => {
    onClose();
    if (item.sourceUrl.startsWith("local:")) {
      openPlayer({ media: item, expand: true });
      return;
    }

    const youtubeId = item.metadata.id;
    const url = item.sourceUrl.startsWith("http")
      ? item.sourceUrl
      : youtubeId
        ? `https://www.youtube.com/watch?v=${youtubeId}`
        : null;

    if (!url) return;

    openPlayer({ url, expand: true });
  };

  const clearHistory = () => {
    setHistory([]);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text size="lg" weight={700}>
          History
        </Text>
      }
      size="lg"
      radius="md"
      centered
    >
      <Stack spacing="md">
        {history.length === 0 ? (
          <Box
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 20px",
            }}
          >
            <Text size="lg" weight={500}>
              No history yet
            </Text>
            <Text size="sm" color="dimmed" mt="xs">
              Songs you play will appear here.
            </Text>
          </Box>
        ) : (
          <>
            <Box
              style={{
                maxHeight: 400,
                overflowY: "auto",
              }}
            >
              <Stack spacing="md">
                {history
                  .sort((a, b) => b.playedAt - a.playedAt)
                  .map((item) => {
                    const meta = item.metadata ?? ({} as HistoryItem["metadata"]);
                    return (
                      <Box
                        key={item.sourceUrl}
                        onClick={() => handlePlay(item)}
                        style={{
                          cursor: "pointer",
                          borderRadius: theme.radius.sm,
                          padding: "8px 12px",
                          transition: "background-color 0.15s",
                        }}
                        sx={{
                          "&:hover": {
                            backgroundColor: theme.colors.dark[5],
                          },
                        }}
                      >
                        <Flex align="center" gap="sm">
                          <Avatar
                            src={meta.coverUrl || undefined}
                            size={48}
                            radius="md"
                            styles={{ image: { objectFit: "cover" } }}
                          >
                            <Center>
                              <IconMusic size={20} />
                            </Center>
                          </Avatar>
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" weight={500} lineClamp={1}>
                              {meta.title || "Unknown"}
                            </Text>
                            <Text size="xs" color="dimmed" lineClamp={1}>
                              {meta.artist ?? meta.author ?? "Unknown"}
                            </Text>
                          </Box>
                          <Text size="xs" color="dimmed" style={{ flexShrink: 0 }}>
                            {timeAgo(item.playedAt)}
                          </Text>
                        </Flex>
                      </Box>
                    );
                  })}
              </Stack>
            </Box>

            <Button
              variant="subtle"
              color="red"
              size="sm"
              leftIcon={<IconTrash size={14} />}
              onClick={clearHistory}
              disabled={history.length === 0}
              fullWidth
            >
              Clear All History
            </Button>
          </>
        )}
      </Stack>
    </Modal>
  );
}
