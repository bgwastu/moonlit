"use client";

/* Hallmark · genre: atmospheric · macrostructure: Workbench-lite · design-system: mantine-dark ·
 * home: centered search + history · accent: dynamic (theme.primaryColor)
 */
import { type CSSProperties, type RefObject, useCallback, useRef, useState } from "react";
import { SiGithub, SiYoutubemusic } from "@icons-pack/react-simple-icons";
import {
  ActionIcon,
  AppShell,
  Box,
  Container,
  Group,
  type MantineTheme,
  Menu,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  rem,
  rgba,
  useMantineTheme,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCookie,
  IconDotsVertical,
  IconLink,
  IconMessage,
  IconSearch,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import parse from "id3-parser";
import { convertFileToBuffer } from "id3-parser/lib/util";
import CookiesModal from "@/components/CookiesModal";
import HistoryList from "@/components/HistoryList";
import Icon from "@/components/Icon";
import LoadingOverlay from "@/components/LoadingOverlay";
import MediaResultRow, { type MediaResultItem } from "@/components/MediaResultRow";
import ResetModal from "@/components/ResetModal";
import YouTubeStatusChip from "@/components/YouTubeStatusChip";
import { useAppContext } from "@/context/AppContext";
import type { Media } from "@/interfaces";
import { youtubeErrorTitle } from "@/lib/apiError";
import { cookieRequestHeaders } from "@/lib/cookies";
import { stashSearchMeta } from "@/lib/searchMeta";
import { SEARCH_ACCENT_VAR } from "@/lib/theme";
import { ensureYouTubeLinkMeta } from "@/lib/youtubeOembed";
import { getYouTubeId, isDirectMediaURL, isYoutubeURL } from "@/utils";
import { setMediaCache } from "@/utils/cache";

const LOCAL_FILE_ACCEPT = ["audio/mpeg", "video/mp4", "audio/wav"];

interface YouTubeResult {
  id: string;
  url: string;
  title: string;
  author: string;
  thumbnail: string;
  lengthSeconds: number;
  viewCount?: number;
  isLive?: boolean;
}

function formatViews(views?: number) {
  if (!views) return "";
  if (views >= 1_000_000)
    return `${(views / 1_000_000).toFixed(views >= 10_000_000 ? 0 : 1)}M views`;
  if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
  return `${views} views`;
}

function accent(t: MantineTheme, shade: number) {
  const key = t.primaryColor;
  return (t.colors[key] ?? t.colors.violet)[shade];
}

function toMediaItem(result: YouTubeResult): MediaResultItem {
  return {
    id: result.id,
    title: result.title,
    author: result.author,
    thumbnail: result.thumbnail,
    lengthSeconds: result.lengthSeconds,
    isLive: result.isLive,
    metaRight: formatViews(result.viewCount) || undefined,
  };
}

/** Compact secondary upload + fullscreen drag-anywhere. */
function LocalUpload() {
  const [loading, setLoading] = useState<{ status: boolean; message: string | null }>({
    status: false,
    message: null,
  });
  const [fullScreenActive, setFullScreenActive] = useState(false);
  const openRef = useRef<() => void>(null);
  const { openPlayer } = useAppContext();
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`) ?? false;

  const handleDrop = async (files: File[]) => {
    if (!files.length) return;
    setLoading({ status: true, message: "Loading file..." });
    setFullScreenActive(false);

    const fileId = `local-${Date.now()}`;
    const sourceUrl = `local:${fileId}:video`;
    const tags = await convertFileToBuffer(files[0]).then(parse);
    const metadata: Media["metadata"] =
      tags !== false
        ? {
            id: fileId,
            title: tags.title ?? files[0].name,
            author: tags.artist ?? "Unknown",
            coverUrl: tags.image?.data
              ? URL.createObjectURL(
                  new Blob([new Uint8Array(tags.image.data)], { type: tags.image.mime }),
                )
              : "",
          }
        : { id: fileId, title: files[0].name, author: "Unknown", coverUrl: "" };

    await setMediaCache(sourceUrl, files[0]);
    const fileUrl = URL.createObjectURL(files[0]);
    const isVideo = files[0].type.startsWith("video/") || /\.mp4$/i.test(files[0].name);
    openPlayer({
      media: {
        fileUrl,
        sourceUrl,
        metadata,
        ...(isVideo && { videoUrl: fileUrl }),
      },
      expand: true,
    });
    setLoading({ status: false, message: null });
  };

  return (
    <>
      <LoadingOverlay visible={loading.status} message={loading.message} />
      {fullScreenActive && (
        <Dropzone.FullScreen
          active
          accept={LOCAL_FILE_ACCEPT}
          maxFiles={1}
          onDrop={handleDrop}
        >
          <Stack align="center" justify="center" gap="lg" mih={260}>
            <IconUpload size="3.2rem" stroke={1.5} color={accent(theme, 4)} />
            <Text size="xl" c="white" fw={600}>
              Drop file anywhere
            </Text>
            <Text
              c="dimmed"
              style={{ cursor: "pointer" }}
              onClick={() => setFullScreenActive(false)}
            >
              Cancel
            </Text>
          </Stack>
        </Dropzone.FullScreen>
      )}

      <Dropzone
        openRef={openRef}
        accept={LOCAL_FILE_ACCEPT}
        maxFiles={1}
        disabled={loading.status}
        onDrop={handleDrop}
        style={{ display: "none" }}
      >
        <div />
      </Dropzone>

      <Group gap={isMobile ? "xs" : "sm"} justify="flex-start" wrap="wrap" px={4}>
        <Text
          component="button"
          type="button"
          size="sm"
          fw={600}
          c="dimmed"
          className="moonlit-focusable"
          onClick={() => openRef.current?.()}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: rem(6),
            transition: "color 150ms ease",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = theme.colors.gray[2];
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = "";
          }}
        >
          <IconUpload size={16} stroke={1.75} />
          Upload a file
        </Text>
        <Text size="sm" c="dimmed" opacity={0.55}>
          MP3, WAV, MP4 ·{" "}
          <Text
            component="span"
            td="underline"
            style={{ cursor: "pointer" }}
            onClick={() => setFullScreenActive(true)}
          >
            drag anywhere
          </Text>
        </Text>
      </Group>
    </>
  );
}

function SearchPanel({
  searchActive,
  setSearchActive,
  clearSearchRef,
}: {
  searchActive: boolean;
  setSearchActive: (active: boolean) => void;
  clearSearchRef: RefObject<(() => void) | null>;
}) {
  const { openPlayer } = useAppContext();
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`) ?? false;
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [resultsForQuery, setResultsForQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const form = useForm({ initialValues: { query: "" } });
  const query = form.values.query.trim();
  const hasQuery = form.values.query.length > 0;
  const isLink = isYoutubeURL(query) || isDirectMediaURL(query);
  const clearBtnSize = isMobile ? 28 : 32;
  const rightSectionWidth = hasQuery ? (isMobile ? 54 : 64) : isMobile ? 12 : 16;
  const listMaxH = isMobile ? rem(320) : rem(420);

  const showSkeleton = !isLink && loading;
  const showEmpty = !isLink && hasSearched && results.length === 0 && !loading;
  const showResultCards = !isLink && hasSearched && results.length > 0 && !loading;
  const showLinkHint = isLink && hasQuery && !loading;
  const showSearchHint = !isLink && hasQuery && !loading && inputFocused;

  function resetSearchUi() {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    form.reset();
    setResults([]);
    setResultsForQuery("");
    setHasSearched(false);
    setSearchActive(false);
    setLoading(false);
    inputRef.current?.blur();
  }

  clearSearchRef.current = resetSearchUi;

  function clearInput() {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    form.setFieldValue("query", "");
    setResults([]);
    setResultsForQuery("");
    setHasSearched(false);
    setSearchActive(false);
    setLoading(false);
    inputRef.current?.focus();
  }

  const search = useCallback(
    async (value: string, showErrors = true) => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setLoading(true);
      setSearchActive(true);
      try {
        const response = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(value)}`,
          { signal: controller.signal, headers: cookieRequestHeaders() },
        );
        const data = (await response.json()) as {
          results?: YouTubeResult[];
          error?: string;
          code?: string;
        };
        if (!response.ok) {
          const err = new Error(data.error || "Search failed");
          if (data.code) Object.assign(err, { code: data.code });
          throw err;
        }
        if (searchAbortRef.current !== controller) return;
        setResults(data.results ?? []);
        setResultsForQuery(value.trim());
        setHasSearched(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (searchAbortRef.current !== controller) return;
        setResults([]);
        setResultsForQuery("");
        setHasSearched(true);
        if (showErrors) {
          const code =
            error instanceof Error && "code" in error
              ? (error as Error & { code?: string }).code
              : undefined;
          const title =
            youtubeErrorTitle(code) === "Request failed"
              ? "Search failed"
              : youtubeErrorTitle(code);
          notifications.show({
            title,
            message: error instanceof Error ? error.message : "Unable to search YouTube",
            color: "red",
            ...(code === "YOUTUBE_UNAVAILABLE" ||
            code === "RATE_LIMITED" ||
            code === "YOUTUBE_BLOCKED"
              ? { autoClose: 20000 }
              : {}),
          });
        }
      } finally {
        if (searchAbortRef.current === controller) {
          setLoading(false);
          searchAbortRef.current = null;
        }
      }
    },
    [setSearchActive],
  );

  async function submit(value: string) {
    const clean = value.trim();
    if (!clean) return;

    if (isDirectMediaURL(clean)) {
      resetSearchUi();
      openPlayer({ url: clean, expand: true });
      return;
    }

    if (isYoutubeURL(clean)) {
      const id = getYouTubeId(clean);
      if (id) {
        const playUrl = `https://www.youtube.com/watch?v=${id}`;
        // Stash oembed titles before open so paste doesn't flash / stick on Unknown.
        await ensureYouTubeLinkMeta(id);
        resetSearchUi();
        openPlayer({ url: playUrl, expand: true });
      }
      return;
    }

    const isPlainSearch =
      clean.length >= 2 && !isYoutubeURL(clean) && !isDirectMediaURL(clean);
    if (isPlainSearch && results.length > 0 && clean === resultsForQuery) {
      playResult(results[0]);
      return;
    }

    await search(clean, true);
  }

  function playResult(result: YouTubeResult) {
    const id = getYouTubeId(result.url) ?? result.id;
    stashSearchMeta(id, {
      title: result.title,
      author: result.author,
      coverUrl: result.thumbnail,
    });
    resetSearchUi();
    openPlayer({ url: `https://www.youtube.com/watch?v=${id}`, expand: true });
  }

  return (
    <Stack
      gap={0}
      w="100%"
      style={{ [SEARCH_ACCENT_VAR]: accent(theme, 5) } as CSSProperties}
    >
      <Box pos="relative" w="100%">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(form.values.query);
          }}
        >
          <TextInput
            ref={inputRef}
            leftSection={<IconSearch size={isMobile ? 18 : 20} stroke={2.2} />}
            leftSectionWidth={isMobile ? rem(38) : rem(44)}
            leftSectionPointerEvents="none"
            classNames={{ input: "moonlit-search-input" }}
            placeholder="Search YouTube or paste a URL..."
            size={isMobile ? "md" : "lg"}
            radius="md"
            autoComplete="off"
            value={form.values.query}
            onChange={(event) => {
              const nextQuery = event.currentTarget.value;
              form.setFieldValue("query", nextQuery);
              const trimmed = nextQuery.trim();
              if (!trimmed) {
                setResults([]);
                setResultsForQuery("");
                setHasSearched(false);
                setSearchActive(false);
                return;
              }
              if (isYoutubeURL(nextQuery) || isDirectMediaURL(nextQuery)) {
                return;
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                if (hasQuery) {
                  clearInput();
                  return;
                }
                inputRef.current?.blur();
              }
            }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            rightSection={
              hasQuery ? (
                <Group gap={4} wrap="nowrap" pr={isMobile ? 4 : 6}>
                  <ActionIcon
                    type="button"
                    size={clearBtnSize}
                    radius="xl"
                    variant="subtle"
                    color="gray"
                    aria-label="Clear search"
                    className="moonlit-focusable"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={clearInput}
                  >
                    <IconX size={isMobile ? 16 : 18} stroke={2} />
                  </ActionIcon>
                </Group>
              ) : null
            }
            rightSectionWidth={rightSectionWidth}
            styles={{
              input: {
                height: isMobile ? rem(46) : rem(50),
                paddingLeft: isMobile ? rem(38) : rem(44),
                paddingRight: rem(rightSectionWidth),
                backgroundColor: rgba(theme.colors.dark[9], 0.58),
                border: `${rem(1)} solid ${rgba(theme.colors.gray[6], 0.4)}`,
                color: theme.white,
                fontWeight: 400,
                fontSize: isMobile ? rem(15) : rem(16),
              },
              section: {
                color: query ? accent(theme, 3) : theme.colors.gray[6],
              },
            }}
          />
        </form>

        {showLinkHint ? (
          <Group gap="sm" wrap="nowrap" mt="xs" px="sm">
            <IconLink size={16} stroke={1.5} color={theme.colors.gray[5]} />
            <Text size="sm" fw={600} c="dimmed">
              Press Enter to play
            </Text>
          </Group>
        ) : null}
        {showSearchHint ? (
          <Text size="sm" fw={600} c="dimmed" mt="xs">
            Press Enter to search
          </Text>
        ) : null}
      </Box>

      {searchActive ? (
        <Box mt="md">
          <Stack gap="xs">
            {(showSkeleton || showResultCards) && (
              <Group justify="space-between" px={4}>
                <Text size="sm" fw={600} c="dimmed">
                  Results
                </Text>
                <Group gap={4} c="dimmed" opacity={0.7}>
                  <SiYoutubemusic size={14} />
                  <Text fw={600} size="xs">
                    YouTube Music
                  </Text>
                </Group>
              </Group>
            )}

            <Box style={{ maxHeight: listMaxH, overflowY: "auto" }}>
              <Stack gap={4}>
                {showSkeleton ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} height={isMobile ? 64 : 76} radius="sm" />
                  ))
                ) : showEmpty ? (
                  <Box py="lg" px="sm">
                    <Text size="sm" fw={600} c="white">
                      No videos found
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Try a different keyword or paste a YouTube link directly.
                    </Text>
                  </Box>
                ) : showResultCards ? (
                  results.map((result) => (
                    <MediaResultRow
                      key={result.id}
                      compact={isMobile}
                      item={toMediaItem(result)}
                      onClick={() => playResult(result)}
                    />
                  ))
                ) : null}
              </Stack>
            </Box>
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

function AppMenu({
  setCookiesOpened,
  setResetOpened,
}: {
  setCookiesOpened: (o: boolean) => void;
  setResetOpened: (o: boolean) => void;
}) {
  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" size="md" aria-label="Menu">
          <IconDotsVertical size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconCookie size={14} />}
          onClick={() => setCookiesOpened(true)}
        >
          Cookie settings
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<IconTrash size={14} />}
          onClick={() => setResetOpened(true)}
        >
          Reset data
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          component="a"
          href="https://github.com/bgwastu/moonlit"
          target="_blank"
          leftSection={<SiGithub size={14} />}
        >
          GitHub
        </Menu.Item>
        <Menu.Item
          component="a"
          href="https://github.com/bgwastu/moonlit/issues"
          target="_blank"
          leftSection={<IconAlertCircle size={14} />}
        >
          Report bugs
        </Menu.Item>
        <Menu.Item
          component="a"
          href="mailto:bagas@wastu.net?subject=Moonlit%20Feedback&body=Hi%20Bagas%2C%0A%0AI%20have%20some%20feedback%20for%20Moonlit%3A%0A"
          leftSection={<IconMessage size={14} />}
        >
          Feedback
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export default function UploadPage() {
  const theme = useMantineTheme();
  const isMobileLayout = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`) ?? false;

  const [cookiesOpened, setCookiesOpened] = useState(false);
  const [resetOpened, setResetOpened] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const clearSearchRef = useRef<(() => void) | null>(null);

  return (
    <>
      <CookiesModal opened={cookiesOpened} onClose={() => setCookiesOpened(false)} />
      <ResetModal opened={resetOpened} onClose={() => setResetOpened(false)} />
      <AppShell
        padding={0}
        styles={{
          main: {
            minHeight: "100dvh",
            backgroundColor: theme.colors.dark[7],
            paddingBottom: "var(--moonlit-player-inset, 0px)",
            transition: "padding-bottom 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          },
        }}
      >
        <Box
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            paddingTop: `calc(${rem(isMobileLayout ? 16 : 24)} + env(safe-area-inset-top, 0px))`,
            paddingBottom: `calc(${rem(16)} + env(safe-area-inset-bottom, 0px))`,
            paddingLeft: rem(16),
            paddingRight: rem(16),
            [SEARCH_ACCENT_VAR]: accent(theme, 5),
          }}
        >
          <Container size="md" w="100%" px={0}>
            <Stack gap={isMobileLayout ? "md" : "lg"}>
              <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                  <UnstyledButton
                    type="button"
                    aria-label="Moonlit — clear search"
                    className="moonlit-focusable"
                    onClick={() => clearSearchRef.current?.()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: rem(10),
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      cursor: "pointer",
                      borderRadius: rem(8),
                    }}
                  >
                    <Icon size={18} />
                    <Text
                      span
                      fw={700}
                      c="white"
                      style={{
                        fontSize: isMobileLayout ? rem(20) : rem(22),
                        letterSpacing: rem(-0.3),
                        lineHeight: 1.2,
                        userSelect: "none",
                        WebkitUserSelect: "none",
                      }}
                    >
                      Moonlit
                    </Text>
                  </UnstyledButton>
                  <YouTubeStatusChip />
                </Group>
                <AppMenu
                  setCookiesOpened={setCookiesOpened}
                  setResetOpened={setResetOpened}
                />
              </Group>

              <Stack gap="md" w="100%" maw={rem(640)}>
                <SearchPanel
                  searchActive={searchActive}
                  setSearchActive={setSearchActive}
                  clearSearchRef={clearSearchRef}
                />

                {!searchActive && (
                  <Stack gap="md">
                    <HistoryList maxHeight={isMobileLayout ? rem(320) : rem(420)} />
                    <LocalUpload />
                  </Stack>
                )}
              </Stack>
            </Stack>
          </Container>
        </Box>
      </AppShell>
    </>
  );
}
