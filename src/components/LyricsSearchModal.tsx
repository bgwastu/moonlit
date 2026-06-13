"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Text,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import { IconCheck, IconMusic, IconSearch } from "@tabler/icons-react";
import { LyricsSearchRecord, sortLyricsSearchRecordsForTrack } from "@/lib/lyrics";
import { getFormattedTime } from "@/utils";

const LRCLIB_SEARCH = "https://lrclib.net/api/search";
const USER_AGENT = "Moonlit (https://github.com/bgwastu/moonlit)";

interface LyricsSearchModalProps {
  opened: boolean;
  onClose: () => void;
  initialSearchQuery: string;
  initialResults?: LyricsSearchRecord[];
  trackDurationSeconds: number;
  currentLyricsId: number | null;
  onSelectLyrics: (lyrics: LyricsSearchRecord) => void;
}

interface SearchState {
  status: "idle" | "loading" | "ready" | "error";
  results: LyricsSearchRecord[];
  error: string | null;
}

export default function LyricsSearchModal({
  opened,
  onClose,
  initialSearchQuery,
  initialResults = [],
  trackDurationSeconds,
  currentLyricsId,
  onSelectLyrics,
}: LyricsSearchModalProps) {
  const theme = useMantineTheme();
  const primaryColor = theme.colors[theme.primaryColor]?.[6] ?? theme.colors.blue[6];
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [searchState, setSearchState] = useState<SearchState>({
    status: "idle",
    results: [],
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const results = searchState.status === "ready" ? searchState.results : initialResults;
  const state =
    searchState.status === "idle" && initialResults.length > 0
      ? "ready"
      : searchState.status;
  const error = searchState.status === "error" ? searchState.error : null;

  useEffect(() => {
    if (!opened) return;
    const id = requestAnimationFrame(() => {
      setSearchQuery(initialSearchQuery);
    });
    return () => cancelAnimationFrame(id);
  }, [opened, initialSearchQuery]);

  const doSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearchState({ status: "loading", results: [], error: null });

    try {
      const params = new URLSearchParams({ q });
      const res = await fetch(`${LRCLIB_SEARCH}?${params}`, {
        headers: { "Lrclib-Client": USER_AGENT },
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`LRCLib returned ${res.status}`);

      const data = (await res.json()) as LyricsSearchRecord[];
      setSearchState({
        status: "ready",
        results: Array.isArray(data) ? data : [],
        error: null,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setSearchState({
        status: "error",
        results: [],
        error: e instanceof Error ? e.message : "Search failed",
      });
    }
  }, []);

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) doSearch(searchQuery.trim());
  }, [searchQuery, doSearch]);

  const filteredAndSortedResults = useMemo(
    () => sortLyricsSearchRecordsForTrack(results, trackDurationSeconds),
    [results, trackDurationSeconds],
  );

  const isDurationMatch = (recordDuration: number) =>
    Math.abs(recordDuration - trackDurationSeconds) <= 1;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Select Lyrics"
      size="lg"
      centered
      styles={{ title: { fontWeight: 600 } }}
    >
      <Box mb="md">
        <Flex gap="sm">
          <TextInput
            placeholder="Search by song title, artist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{ flex: 1 }}
          />
          <Button
            onClick={handleSearch}
            loading={state === "loading"}
            leftIcon={<IconSearch size={16} />}
          >
            Search
          </Button>
        </Flex>
        {error && (
          <Text size="xs" c="red" mt="xs">
            {error}
          </Text>
        )}
      </Box>

      <ScrollArea h={350}>
        {state === "loading" && (
          <Flex justify="center" align="center" h={280} gap="xs">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Searching for lyrics...
            </Text>
          </Flex>
        )}
        {state === "ready" && filteredAndSortedResults.length === 0 && (
          <Flex justify="center" align="center" h={280} direction="column" gap="sm">
            <IconMusic size={48} style={{ opacity: 0.3 }} />
            <Text c="dimmed" size="sm">
              No synced lyrics found
            </Text>
            <Text c="dimmed" size="xs">
              Try different search terms
            </Text>
          </Flex>
        )}
        {state === "ready" && filteredAndSortedResults.length > 0 && (
          <Box>
            {filteredAndSortedResults.map((record) => {
              const isMatch = isDurationMatch(record.duration);
              const isSelected = record.id === currentLyricsId;
              return (
                <Box
                  key={record.id}
                  p="sm"
                  mb="xs"
                  style={{
                    borderRadius: 8,
                    backgroundColor: isSelected
                      ? `color-mix(in srgb, ${primaryColor} 15%, transparent)`
                      : "rgba(255, 255, 255, 0.05)",
                    border: isSelected
                      ? `1px solid color-mix(in srgb, ${primaryColor} 50%, transparent)`
                      : "1px solid transparent",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                  onClick={() => {
                    onSelectLyrics(record);
                    onClose();
                  }}
                >
                  <Flex justify="space-between" align="start">
                    <Box style={{ flex: 1 }}>
                      <Flex align="center" gap="xs" mb={4}>
                        <Text size="sm" fw={600} lineClamp={1}>
                          {record.trackName}
                        </Text>
                        {isSelected && (
                          <IconCheck size={16} style={{ color: primaryColor }} />
                        )}
                      </Flex>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {record.artistName}
                        {record.albumName && ` · ${record.albumName}`}
                      </Text>
                    </Box>
                    <Group spacing={4}>
                      <Badge
                        size="sm"
                        color={isMatch ? theme.primaryColor : "gray"}
                        variant={isMatch ? "filled" : "outline"}
                      >
                        {getFormattedTime(record.duration)}
                      </Badge>
                    </Group>
                  </Flex>
                </Box>
              );
            })}
          </Box>
        )}
        {state === "idle" && (
          <Flex justify="center" align="center" h={280} direction="column" gap="md">
            <IconSearch size={48} style={{ opacity: 0.3 }} />
            <Box style={{ textAlign: "center" }}>
              <Text c="dimmed" size="sm" mb={4}>
                Search for lyrics by song title or artist
              </Text>
              <Text c="dimmed" size="xs">
                Track duration: {getFormattedTime(trackDurationSeconds)}
              </Text>
            </Box>
          </Flex>
        )}
      </ScrollArea>
    </Modal>
  );
}
