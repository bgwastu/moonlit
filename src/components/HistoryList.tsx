"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  rem,
  rgba,
  useMantineTheme,
} from "@mantine/core";
import { IconHistory, IconTrash } from "@tabler/icons-react";
import MediaResultRow from "@/components/MediaResultRow";
import { useAppContext } from "@/context/AppContext";
import type { HistoryItem } from "@/interfaces";
import { buildProvisionalMedia } from "@/lib/mergePlayerMedia";
import { historyItemSourceUrl, resolvePlayableMedia } from "@/lib/playFromCache";
import { stashSearchMeta } from "@/lib/searchMeta";
import { getYouTubeId, timeAgo } from "@/utils";
import { MEDIA_CACHE_CHANGED_EVENT, getAvailableMediaSources } from "@/utils/cache";

interface HistoryListProps {
  onPlay?: () => void;
  maxHeight?: number | string;
  showClear?: boolean;
  localOnly?: boolean;
}

export default function HistoryList({
  onPlay,
  maxHeight,
  showClear = true,
  localOnly = false,
}: HistoryListProps) {
  const { history, clearHistory, openPlayer } = useAppContext();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const theme = useMantineTheme();
  const [availableSources, setAvailableSources] = useState<string[] | null>(null);

  useEffect(() => {
    if (!localOnly) return;
    let cancelled = false;
    let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      const sources = await getAvailableMediaSources();
      if (!cancelled && current === generation) setAvailableSources(sources);
    };
    void refresh();
    window.addEventListener(MEDIA_CACHE_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(MEDIA_CACHE_CHANGED_EVENT, refresh);
    };
  }, [localOnly, history]);

  const handlePlay = async (item: HistoryItem) => {
    onPlay?.();

    const url = historyItemSourceUrl(item);
    const playUrl = url ?? item.sourceUrl;
    if (!playUrl) return;

    const ytId = getYouTubeId(playUrl) ?? item.metadata?.id;
    if (ytId) stashSearchMeta(String(ytId), item.metadata);

    const cached = await resolvePlayableMedia({
      sourceUrl: item.sourceUrl,
      metadata: item.metadata,
      fromHistory: item,
    });
    if (cached) {
      // Pass url for YouTube so embed id resolves; IDB stays audio-only.
      // Normalize sourceUrl to playUrl so shell identity stays aligned with the open URL.
      openPlayer({
        media: { ...cached, sourceUrl: playUrl },
        url,
      });
      return;
    }

    if (localOnly || item.sourceUrl.startsWith("local:")) {
      // A cleared or evicted file must never fall through to online extraction.
      const sources = await getAvailableMediaSources();
      setAvailableSources(sources);
      return;
    }

    // Seed titles/cover so extract/cache cannot flash Unknown + YT hqdefault.
    // Always go through provisional builder so remote covers are proxied.
    openPlayer({
      url: playUrl,
      media: {
        ...buildProvisionalMedia(playUrl, item.metadata),
        ...(item.isAudioTrackVideo ? { isAudioTrackVideo: true } : {}),
      },
    });
  };

  const sorted = history
    .filter((item) => !localOnly || availableSources?.includes(item.sourceUrl))
    .sort((a, b) => b.playedAt - a.playedAt);

  if (localOnly && availableSources === null)
    return (
      <Group gap="xs" px={4}>
        <Loader size={14} />
        <Text size="sm" c="dimmed">
          Checking saved music…
        </Text>
      </Group>
    );

  if (sorted.length === 0) {
    return (
      <Box
        py="xl"
        px="md"
        style={{
          borderRadius: theme.radius.md,
          border: `${rem(1)} dashed ${rgba(theme.colors.gray[6], 0.35)}`,
          backgroundColor: rgba(theme.colors.dark[8], 0.28),
        }}
      >
        <Stack gap="sm" align="flex-start">
          <IconHistory size={28} stroke={1.5} opacity={0.55} />
          <Box>
            <Text size="sm" fw={600} c="white">
              {localOnly ? "No music saved on this device yet" : "No recent plays"}
            </Text>
            <Text size="sm" c="dimmed" mt={4} maw={360}>
              {localOnly
                ? "Choose a music file above to start listening."
                : "Play a song to get started — then tweak speed, pitch, or reverb."}
            </Text>
          </Box>
        </Stack>
      </Box>
    );
  }

  return (
    <>
      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Clear recent history?"
        centered
        radius="md"
      >
        <Text size="sm" c="dimmed" mb="md">
          This removes all recent plays and cached audio and artwork from this device. It
          cannot be undone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              void clearHistory().finally(() => setConfirmOpen(false));
            }}
          >
            Clear all
          </Button>
        </Group>
      </Modal>

      <Stack gap="xs">
        <Group justify="space-between" px={4} style={{ flexShrink: 0 }}>
          <Text size="sm" fw={600} c="dimmed">
            {localOnly ? "On this device" : "Recent"}
          </Text>
          {showClear && (
            <Button
              variant="subtle"
              color="red"
              size="compact-xs"
              leftSection={<IconTrash size={12} />}
              onClick={() => setConfirmOpen(true)}
            >
              Clear
            </Button>
          )}
        </Group>
        <Box
          style={{
            maxHeight: maxHeight ?? rem(420),
            overflowY: "auto",
          }}
        >
          <Stack gap={4}>
            {sorted.map((item) => {
              const meta = item.metadata ?? ({} as HistoryItem["metadata"]);
              return (
                <MediaResultRow
                  key={item.sourceUrl}
                  compact
                  item={{
                    id: meta.id || item.sourceUrl,
                    title: meta.title || "Unknown",
                    author: meta.artist ?? meta.author ?? "Unknown",
                    thumbnail: meta.coverUrl || "",
                    sourceUrl: item.sourceUrl,
                    metaRight: timeAgo(item.playedAt),
                  }}
                  onClick={() => void handlePlay(item)}
                />
              );
            })}
          </Stack>
        </Box>
      </Stack>
    </>
  );
}
