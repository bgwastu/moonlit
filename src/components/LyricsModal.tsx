"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Switch,
  Text,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCheck,
  IconMinus,
  IconMusic,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { LyricsSearchRecord, sortLyricsSearchRecordsForTrack } from "@/lib/lyrics";
import { getFormattedTime } from "@/utils";

const LRCLIB_SEARCH = "https://lrclib.net/api/search";
const USER_AGENT = "Moonlit (https://github.com/bgwastu/moonlit)";

interface LyricsModalProps {
  opened: boolean;
  onClose: () => void;
  showLyrics: boolean;
  onToggleLyrics: (show: boolean) => void;
  trackDurationSeconds: number;
  currentLyricsId: number | null;
  currentLyricsTrackName: string | null;
  currentLyricsArtistName: string | null;
  currentLyricsAlbumName?: string | null;
  currentOffset: number;
  onOffsetChange: (offset: number) => void;
  initialSearchQuery: string;
  initialSearchResults: LyricsSearchRecord[];
  onSelectLyrics: (record: LyricsSearchRecord) => void;
}

export default function LyricsModal({
  opened,
  onClose,
  showLyrics,
  onToggleLyrics,
  trackDurationSeconds,
  currentLyricsId,
  currentLyricsTrackName,
  currentLyricsArtistName,
  currentLyricsAlbumName,
  currentOffset,
  onOffsetChange,
  initialSearchQuery,
  initialSearchResults,
  onSelectLyrics,
}: LyricsModalProps) {
  const theme = useMantineTheme();
  const primaryColor = theme.colors[theme.primaryColor]?.[6] ?? theme.colors.blue[6];
  const [view, setView] = useState<"settings" | "search">(
    currentLyricsTrackName ? "settings" : "search",
  );

  const hasLyrics = !!currentLyricsTrackName;

  // Reset view when modal opens
  useEffect(() => {
    if (!opened) return;
    queueMicrotask(() => setView(currentLyricsTrackName ? "settings" : "search"));
  }, [opened, currentLyricsTrackName]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Lyrics"
      size="md"
      centered
      styles={{ title: { fontWeight: 600 } }}
    >
      {view === "settings" ? (
        <SettingsView
          showLyrics={showLyrics}
          onToggleLyrics={onToggleLyrics}
          hasLyrics={hasLyrics}
          currentLyricsTrackName={currentLyricsTrackName}
          currentLyricsArtistName={currentLyricsArtistName}
          currentLyricsAlbumName={currentLyricsAlbumName}
          currentOffset={currentOffset}
          onOffsetChange={onOffsetChange}
          onSearch={() => setView("search")}
        />
      ) : (
        <SearchView
          initialSearchQuery={initialSearchQuery}
          initialResults={initialSearchResults}
          trackDurationSeconds={trackDurationSeconds}
          currentLyricsId={currentLyricsId}
          onSelectLyrics={onSelectLyrics}
          onBack={() => setView("settings")}
        />
      )}
    </Modal>
  );
}

function SettingsView({
  showLyrics,
  onToggleLyrics,
  hasLyrics,
  currentLyricsTrackName,
  currentLyricsArtistName,
  currentLyricsAlbumName,
  currentOffset,
  onOffsetChange,
  onSearch,
}: {
  showLyrics: boolean;
  onToggleLyrics: (show: boolean) => void;
  hasLyrics: boolean;
  currentLyricsTrackName: string | null;
  currentLyricsArtistName: string | null;
  currentLyricsAlbumName?: string | null;
  currentOffset: number;
  onOffsetChange: (offset: number) => void;
  onSearch: () => void;
}) {
  const theme = useMantineTheme();
  const primaryColor = theme.colors[theme.primaryColor]?.[6] ?? theme.colors.blue[6];

  return (
    <Box>
      <Flex align="center" justify="space-between" mb="md">
        <Text size="sm" fw={500}>
          Show Lyrics
        </Text>
        <Switch
          checked={showLyrics}
          onChange={(e) => onToggleLyrics(e.currentTarget.checked)}
          size="md"
        />
      </Flex>

      {hasLyrics ? (
        <>
          <Text size="sm" fw={500} mb="xs">
            Current Lyrics
          </Text>
          <Box
            p="sm"
            mb="md"
            style={{
              borderRadius: 8,
              backgroundColor: `color-mix(in srgb, ${primaryColor} 15%, transparent)`,
              border: `1px solid color-mix(in srgb, ${primaryColor} 40%, transparent)`,
            }}
          >
            <Flex align="center" gap="xs">
              <IconCheck size={16} style={{ color: primaryColor }} />
              <Box style={{ flex: 1 }}>
                <Text size="sm" fw={600} lineClamp={1}>
                  {currentLyricsTrackName}
                </Text>
                {(currentLyricsArtistName || currentLyricsAlbumName) && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {currentLyricsArtistName}
                    {currentLyricsAlbumName && ` · ${currentLyricsAlbumName}`}
                  </Text>
                )}
              </Box>
            </Flex>
          </Box>

          <Text size="sm" fw={500} mb="xs">
            Timing Offset
          </Text>
          <Flex align="center" gap="sm" mb="md">
            <ActionIcon
              variant="default"
              size="lg"
              onClick={() => onOffsetChange(currentOffset - 1)}
            >
              <IconMinus size={16} />
            </ActionIcon>
            <Text
              size="sm"
              fw={500}
              style={{
                minWidth: 60,
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {currentOffset >= 0 ? `+${currentOffset}` : currentOffset}s
            </Text>
            <ActionIcon
              variant="default"
              size="lg"
              onClick={() => onOffsetChange(currentOffset + 1)}
            >
              <IconPlus size={16} />
            </ActionIcon>
            {currentOffset !== 0 && (
              <Button variant="subtle" size="xs" onClick={() => onOffsetChange(0)}>
                Reset
              </Button>
            )}
          </Flex>

          <Button
            variant="default"
            fullWidth
            leftIcon={<IconSearch size={16} />}
            onClick={onSearch}
          >
            Search for Lyrics
          </Button>
        </>
      ) : (
        <Flex direction="column" align="center" py="xl" gap="md">
          <Text c="dimmed" size="sm">
            No lyrics selected
          </Text>
          <Button
            variant="default"
            leftIcon={<IconSearch size={16} />}
            onClick={onSearch}
          >
            Search for Lyrics
          </Button>
        </Flex>
      )}
    </Box>
  );
}

function SearchView({
  initialSearchQuery,
  initialResults,
  trackDurationSeconds,
  currentLyricsId,
  onSelectLyrics,
  onBack,
}: {
  initialSearchQuery: string;
  initialResults: LyricsSearchRecord[];
  trackDurationSeconds: number;
  currentLyricsId: number | null;
  onSelectLyrics: (record: LyricsSearchRecord) => void;
  onBack: () => void;
}) {
  const theme = useMantineTheme();
  const primaryColor = theme.colors[theme.primaryColor]?.[6] ?? theme.colors.blue[6];
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [searchState, setSearchState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    results: LyricsSearchRecord[];
    error: string | null;
  }>({
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

  const filteredAndSortedResults = useMemo(
    () => sortLyricsSearchRecordsForTrack(results, trackDurationSeconds),
    [results, trackDurationSeconds],
  );

  return (
    <Box>
      <Button
        variant="subtle"
        onClick={onBack}
        mb="sm"
        size="sm"
        leftIcon={<IconArrowLeft size={16} />}
      >
        Back to Settings
      </Button>
      <Flex gap="sm" mb="md">
        <TextInput
          placeholder="Search by song title, artist..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch(searchQuery.trim())}
          style={{ flex: 1 }}
        />
        <Button
          onClick={() => doSearch(searchQuery.trim())}
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
              const isMatch = Math.abs(record.duration - trackDurationSeconds) <= 1;
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
                  onClick={() => onSelectLyrics(record)}
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
            <Text c="dimmed" size="sm" mb={4}>
              Search for lyrics by song title or artist
            </Text>
            <Text c="dimmed" size="xs">
              Track duration: {getFormattedTime(trackDurationSeconds)}
            </Text>
          </Flex>
        )}
      </ScrollArea>
    </Box>
  );
}
