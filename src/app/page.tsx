"use client";

/* Hallmark · genre: atmospheric · macrostructure: Workbench-lite · design-system: mantine-dark ·
 * home: centered search + history · accent: dynamic (theme.primaryColor)
 */
import { useCallback, useRef, useState } from "react";
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
  Title,
  rem,
  useMantineTheme,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowRight,
  IconCookie,
  IconDotsVertical,
  IconLink,
  IconMessage,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import parse from "id3-parser";
import { convertFileToBuffer } from "id3-parser/lib/util";
import CookiesModal from "@/components/CookiesModal";
import HistoryList from "@/components/HistoryList";
import Icon from "@/components/Icon";
import LoadingOverlay from "@/components/LoadingOverlay";
import MediaResultRow, { type MediaResultItem } from "@/components/MediaResultRow";
import ResetModal from "@/components/ResetModal";
import { useAppContext } from "@/context/AppContext";
import type { Media } from "@/interfaces";
import { getYouTubeId, isDirectMediaURL, isYoutubeURL } from "@/utils";
import { setMediaCache } from "@/utils/cache";

const LOCAL_FILE_ACCEPT = ["audio/mpeg", "video/mp4", "audio/wav"];
const SEARCH_LIMIT = 10;

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

function focusRing(t: MantineTheme) {
  return {
    outline: `${rem(2)} solid ${accent(t, 5)}`,
    outlineOffset: rem(2),
  };
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
          <Stack align="center" justify="center" spacing="lg" mih={260}>
            <IconUpload size="3.2rem" stroke={1.5} color={accent(theme, 4)} />
            <Text size="xl" color="white" weight={600}>
              Drop file anywhere
            </Text>
            <Text
              color="dimmed"
              onClick={() => setFullScreenActive(false)}
              sx={{ cursor: "pointer" }}
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
        sx={{ display: "none" }}
      >
        <div />
      </Dropzone>

      <Group
        spacing={isMobile ? "xs" : "sm"}
        position="left"
        sx={{ flexWrap: "wrap" }}
        px={4}
      >
        <Text
          component="button"
          type="button"
          size="sm"
          weight={600}
          color="dimmed"
          onClick={() => openRef.current?.()}
          sx={(t) => ({
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: rem(6),
            transition: "color 150ms ease",
            "&:hover": { color: t.colors.gray[2] },
            "&:focus-visible": focusRing(t),
          })}
        >
          <IconUpload size={16} stroke={1.75} />
          Upload a file
        </Text>
        <Text size="sm" color="dimmed" opacity={0.55}>
          MP3, WAV, MP4 ·{" "}
          <Text
            component="span"
            underline
            sx={{ cursor: "pointer" }}
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
}: {
  searchActive: boolean;
  setSearchActive: (active: boolean) => void;
}) {
  const { openPlayer } = useAppContext();
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`) ?? false;
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [resultsForQuery, setResultsForQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const focusedRef = useRef(false);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const form = useForm({ initialValues: { query: "" } });
  const query = form.values.query.trim();
  const isLink = isYoutubeURL(query) || isDirectMediaURL(query);
  const rightSectionWidth = isLink ? (isMobile ? 54 : 64) : isMobile ? 12 : 16;
  const listMaxH = isMobile ? rem(320) : rem(420);

  const showSkeleton = !isLink && loading;
  const showEmpty = !isLink && hasSearched && results.length === 0 && !loading;
  const showResultCards = !isLink && hasSearched && results.length > 0 && !loading;
  const showSuggestions =
    searchActive && !isLink && !hasSearched && !loading && query.length > 0;
  const showLinkHint = searchActive && isLink && !loading;

  function updateSearchActive(nextFocused: boolean, nextQuery: string) {
    const cleanQuery = nextQuery.trim();
    const hasQuery = cleanQuery.length > 0;
    const hasVisibleResults = results.length > 0 || hasSearched || loading;
    setSearchActive(hasQuery && (nextFocused || hasVisibleResults || hasQuery));
  }

  const fetchSuggestions = useCallback(async (value: string) => {
    const clean = value.trim();
    if (clean.length < 1 || isYoutubeURL(clean) || isDirectMediaURL(clean)) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    suggestAbortRef.current?.abort();
    const controller = new AbortController();
    suggestAbortRef.current = controller;
    setSuggestLoading(true);
    try {
      const response = await fetch(
        `/api/youtube/suggest?q=${encodeURIComponent(clean)}&limit=10`,
        { signal: controller.signal },
      );
      const data = (await response.json()) as {
        suggestions?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Failed to load suggestions");
      setSuggestions(data.suggestions ?? []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSuggestions([]);
    } finally {
      if (suggestAbortRef.current === controller) {
        setSuggestLoading(false);
      }
    }
  }, []);

  const scheduleSuggestions = useCallback(
    (value: string) => {
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
      suggestTimerRef.current = setTimeout(() => {
        void fetchSuggestions(value);
      }, 180);
    },
    [fetchSuggestions],
  );

  const search = useCallback(
    async (value: string, signal?: AbortSignal, showErrors = true) => {
      setLoading(true);
      setSuggestions([]);
      try {
        const response = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(value)}&limit=${SEARCH_LIMIT}`,
          { signal },
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
        setResults(data.results ?? []);
        setResultsForQuery(value.trim());
        setHasSearched(true);
        if (value.trim()) setSearchActive(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setResultsForQuery("");
        setHasSearched(true);
        if (showErrors) {
          const code =
            error instanceof Error && "code" in error
              ? (error as Error & { code?: string }).code
              : undefined;
          const isUnavailable = code === "SEARCH_UNAVAILABLE";
          notifications.show({
            title: isUnavailable ? "Search unavailable" : "Search failed",
            message: error instanceof Error ? error.message : "Unable to search YouTube",
            color: "red",
            ...(isUnavailable ? { autoClose: 20000 } : {}),
          });
        }
      } finally {
        setLoading(false);
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
        resetSearchUi();
        openPlayer({ url: `https://www.youtube.com/watch?v=${id}`, expand: true });
      }
      return;
    }

    const isPlainSearch =
      clean.length >= 2 && !isYoutubeURL(clean) && !isDirectMediaURL(clean);
    if (isPlainSearch && results.length > 0 && clean === resultsForQuery) {
      playResult(results[0]);
      return;
    }

    await search(clean, undefined, true);
  }

  function resetSearchUi() {
    form.reset();
    setResults([]);
    setResultsForQuery("");
    setHasSearched(false);
    setSuggestions([]);
    setSearchActive(false);
    focusedRef.current = false;
  }

  function playResult(result: YouTubeResult) {
    const id = getYouTubeId(result.url) ?? result.id;
    try {
      sessionStorage.setItem(
        `moonlit-search-meta:${id}`,
        JSON.stringify({
          title: result.title,
          author: result.author,
          coverUrl: result.thumbnail,
          duration: result.lengthSeconds,
        }),
      );
    } catch {
      // sessionStorage may be full or unavailable
    }
    resetSearchUi();
    openPlayer({ url: `https://www.youtube.com/watch?v=${id}`, expand: true });
  }

  function applySuggestion(suggestion: string) {
    form.setFieldValue("query", suggestion);
    setHasSearched(false);
    setResults([]);
    setSuggestions([]);
    void search(suggestion);
  }

  return (
    <Stack spacing={0} w="100%">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(form.values.query);
        }}
      >
        <TextInput
          icon={<IconSearch size={isMobile ? 18 : 20} stroke={2.2} />}
          placeholder="Search YouTube or paste a URL..."
          size={isMobile ? "md" : "lg"}
          radius="md"
          value={form.values.query}
          onChange={(event) => {
            const nextQuery = event.currentTarget.value;
            form.setFieldValue("query", nextQuery);
            updateSearchActive(focusedRef.current, nextQuery);
            const trimmed = nextQuery.trim();
            if (
              trimmed.length < 2 ||
              isYoutubeURL(nextQuery) ||
              isDirectMediaURL(nextQuery)
            ) {
              setHasSearched(false);
              setResults([]);
              setResultsForQuery("");
              setSuggestions([]);
            } else if (trimmed !== resultsForQuery) {
              setHasSearched(false);
              setResults([]);
            }
            scheduleSuggestions(nextQuery);
          }}
          onFocus={() => {
            focusedRef.current = true;
            updateSearchActive(true, form.values.query);
            if (form.values.query.trim().length > 0) {
              scheduleSuggestions(form.values.query);
            }
          }}
          onBlur={() => {
            focusedRef.current = false;
            updateSearchActive(false, form.values.query);
          }}
          rightSection={
            isLink ? (
              <ActionIcon
                type="submit"
                size={isMobile ? 36 : 40}
                radius="sm"
                loading={loading}
                variant="filled"
                color={theme.primaryColor}
                sx={(t) => ({ "&:focus-visible": focusRing(t) })}
              >
                <IconArrowRight size={isMobile ? 18 : 22} />
              </ActionIcon>
            ) : null
          }
          rightSectionWidth={rightSectionWidth}
          styles={(t) => ({
            input: {
              height: isMobile ? rem(46) : rem(50),
              paddingLeft: isMobile ? rem(38) : rem(44),
              paddingRight: isLink ? (isMobile ? rem(54) : rem(60)) : rem(14),
              backgroundColor: t.fn.rgba(t.colors.dark[9], 0.58),
              border: `${rem(1)} solid ${t.fn.rgba(t.colors.gray[6], 0.4)}`,
              color: t.white,
              fontWeight: 400,
              fontSize: isMobile ? rem(15) : rem(16),
              "&::placeholder": { color: t.fn.rgba(t.colors.gray[4], 0.75) },
              "&:focus, &:focus-within": {
                borderColor: accent(t, 5),
              },
            },
            icon: {
              color: query ? accent(t, 3) : t.colors.gray[6],
              width: isMobile ? rem(38) : rem(44),
            },
          })}
        />
      </form>

      {searchActive ? (
        <Box mt="md">
          <Stack spacing="xs">
            {(showSkeleton || showResultCards) && (
              <Group position="apart" px={4}>
                <Text size="sm" weight={600} color="dimmed">
                  Results
                </Text>
                <Group spacing={4} c="dimmed" opacity={0.7}>
                  <SiYoutubemusic size={14} />
                  <Text weight={600} size="xs">
                    YouTube Music
                  </Text>
                </Group>
              </Group>
            )}

            {showSuggestions && (suggestLoading || suggestions.length > 0) && (
              <Text size="sm" weight={600} color="dimmed" px={4}>
                Suggestions
              </Text>
            )}

            <Box
              sx={{
                maxHeight: listMaxH,
                overflowY: "auto",
              }}
            >
              <Stack spacing={4}>
                {showSkeleton ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} height={isMobile ? 64 : 76} radius="sm" />
                  ))
                ) : showLinkHint ? (
                  <Box py="md" px="sm">
                    <Group spacing="sm" noWrap>
                      <IconLink size={18} stroke={1.5} color={theme.colors.gray[5]} />
                      <Text size="sm" weight={600} color="white">
                        Press Enter to play
                      </Text>
                    </Group>
                  </Box>
                ) : showEmpty ? (
                  <Box py="lg" px="sm">
                    <Text size="sm" weight={600} color="white">
                      No videos found
                    </Text>
                    <Text size="xs" color="dimmed" mt={4}>
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
                ) : showSuggestions ? (
                  suggestLoading && suggestions.length === 0 ? (
                    Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} height={36} radius="sm" />
                    ))
                  ) : (
                    suggestions.map((suggestion) => (
                      <Box
                        key={suggestion}
                        component="button"
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        sx={(t) => ({
                          display: "flex",
                          alignItems: "center",
                          gap: rem(10),
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          borderRadius: t.radius.sm,
                          padding: `${rem(8)} ${rem(10)}`,
                          background: "transparent",
                          color: t.white,
                          cursor: "pointer",
                          transition: "background-color 150ms ease",
                          "&:hover": {
                            backgroundColor: t.fn.rgba(t.colors.dark[5], 0.85),
                          },
                          "&:focus-visible": focusRing(t),
                        })}
                      >
                        <IconSearch
                          size={16}
                          stroke={1.75}
                          color={theme.colors.gray[5]}
                        />
                        <Text size="sm" weight={500} lineClamp={1}>
                          {suggestion}
                        </Text>
                      </Box>
                    ))
                  )
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
        <Menu.Item icon={<IconCookie size={14} />} onClick={() => setCookiesOpened(true)}>
          Cookie settings
        </Menu.Item>
        <Menu.Item
          color="red"
          icon={<IconTrash size={14} />}
          onClick={() => setResetOpened(true)}
        >
          Reset data
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          component="a"
          href="https://github.com/bgwastu/moonlit"
          target="_blank"
          icon={<SiGithub size={14} />}
        >
          GitHub
        </Menu.Item>
        <Menu.Item
          component="a"
          href="https://github.com/bgwastu/moonlit/issues"
          target="_blank"
          icon={<IconAlertCircle size={14} />}
        >
          Report bugs
        </Menu.Item>
        <Menu.Item
          component="a"
          href="mailto:bagas@wastu.net?subject=Moonlit%20Feedback&body=Hi%20Bagas%2C%0A%0AI%20have%20some%20feedback%20for%20Moonlit%3A%0A"
          icon={<IconMessage size={14} />}
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

  return (
    <>
      <CookiesModal opened={cookiesOpened} onClose={() => setCookiesOpened(false)} />
      <ResetModal opened={resetOpened} onClose={() => setResetOpened(false)} />
      <AppShell
        padding={0}
        styles={(t) => ({
          main: {
            minHeight: "100dvh",
            backgroundColor: t.colors.dark[7],
            paddingBottom: "var(--moonlit-player-inset, 0px)",
            transition: "padding-bottom 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          },
        })}
      >
        <Box
          sx={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            paddingTop: `calc(${rem(isMobileLayout ? 16 : 24)} + env(safe-area-inset-top, 0px))`,
            paddingBottom: `calc(${rem(16)} + env(safe-area-inset-bottom, 0px))`,
            paddingLeft: rem(16),
            paddingRight: rem(16),
          }}
        >
          <Container size="md" w="100%" px={0}>
            <Stack spacing={isMobileLayout ? "md" : "lg"}>
              <Group position="apart" align="center" noWrap>
                <Group spacing={10} noWrap>
                  <Icon size={18} />
                  <Title
                    order={1}
                    fw={700}
                    sx={(t) => ({
                      color: t.white,
                      fontSize: rem(22),
                      letterSpacing: rem(-0.3),
                      lineHeight: 1.2,
                      [t.fn.smallerThan("sm")]: {
                        fontSize: rem(20),
                      },
                    })}
                  >
                    Moonlit
                  </Title>
                </Group>
                <AppMenu
                  setCookiesOpened={setCookiesOpened}
                  setResetOpened={setResetOpened}
                />
              </Group>

              <Stack spacing="md" w="100%" maw={rem(640)}>
                <SearchPanel
                  searchActive={searchActive}
                  setSearchActive={setSearchActive}
                />

                {!searchActive && (
                  <Stack spacing="md">
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
