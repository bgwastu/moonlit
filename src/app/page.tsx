"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { SiGithub, SiYoutube } from "@icons-pack/react-simple-icons";
import {
  ActionIcon,
  Anchor,
  AppShell,
  Badge,
  Box,
  Center,
  Container,
  Divider,
  Flex,
  Group,
  Image,
  type MantineTheme,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
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
  IconFileMusic,
  IconHistory,
  IconLink,
  IconMessage,
  IconMusic,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import parse from "id3-parser";
import { convertFileToBuffer } from "id3-parser/lib/util";
import CookiesModal from "@/components/CookiesModal";
import HistoryModal from "@/components/HistoryModal";
import Icon from "@/components/Icon";
import LoadingOverlay from "@/components/LoadingOverlay";
import ResetModal from "@/components/ResetModal";
import { useAppContext } from "@/context/AppContext";
import type { Media } from "@/interfaces";
import { getYouTubeId, isDirectMediaURL, isYoutubeURL } from "@/utils";
import { setMediaCache } from "@/utils/cache";

const LOCAL_FILE_ACCEPT = ["audio/mpeg", "video/mp4", "audio/wav"];

/** Min height for the search-results panel (text query mode). */
function panelContentMinHeight(isMobile: boolean) {
  return isMobile ? 260 : 300;
}

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

function formatDuration(seconds: number) {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatViews(views?: number) {
  if (!views) return "";
  if (views >= 1_000_000)
    return `${(views / 1_000_000).toFixed(views >= 10_000_000 ? 0 : 1)}M views`;
  if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
  return `${views} views`;
}

/** Theme primary (track brand when playing, else violet). */
function accent(t: MantineTheme, shade: number) {
  const key = t.primaryColor;
  return (t.colors[key] ?? t.colors.violet)[shade];
}

function LocalUpload({ dropzoneMinHeight }: { dropzoneMinHeight: number }) {
  const [loading, setLoading] = useState<{ status: boolean; message: string | null }>({
    status: false,
    message: null,
  });
  const [fullScreenActive, setFullScreenActive] = useState(false);
  const { openPlayer } = useAppContext();
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

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
        accept={LOCAL_FILE_ACCEPT}
        maxFiles={1}
        disabled={loading.status}
        onDrop={handleDrop}
        sx={(t) => ({
          backgroundColor: t.fn.rgba(t.colors.dark[8], 0.28),
          border: `${rem(2)} dashed ${t.fn.rgba(t.colors.gray[6], 0.35)}`,
          borderRadius: t.radius.md,
          padding: 0,
          transition: "border-color 150ms ease, background-color 150ms ease",
          "&:hover": {
            backgroundColor: t.fn.rgba(t.colors.dark[7], 0.42),
            borderColor: t.fn.rgba(accent(t, 5), 0.58),
          },
          "&:hover .upload-icon-card": {
            backgroundColor: t.fn.rgba(accent(t, 9), 0.34),
            color: accent(t, 2),
            filter: `drop-shadow(0 0 ${rem(12)} ${t.fn.rgba(accent(t, 4), 0.38)})`,
            transform: "scale(1.06)",
          },
        })}
      >
        <Stack
          spacing={isMobile ? "xs" : "sm"}
          align="center"
          justify="center"
          sx={{ minHeight: rem(dropzoneMinHeight) }}
        >
          <Center
            w={isMobile ? 38 : 48}
            h={isMobile ? 38 : 48}
            sx={(t) => ({
              borderRadius: t.radius.md,
              background: t.fn.rgba(t.colors.dark[5], 0.55),
              color: t.colors.gray[4],
              transition:
                "background-color 160ms ease, color 160ms ease, filter 160ms ease, transform 160ms ease",
            })}
            className="upload-icon-card"
          >
            <IconFileMusic size={isMobile ? 20 : 26} stroke={1.5} />
          </Center>
          <Box ta="center" px={isMobile ? 4 : 0}>
            <Text size={isMobile ? "sm" : "md"} weight={600} color="white">
              Upload Local File
            </Text>
            <Text size={isMobile ? "xs" : "sm"} color="dimmed" mt={isMobile ? 4 : 6}>
              Supports MP3, WAV, MP4 · or{" "}
              <Text
                component="span"
                underline
                sx={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFullScreenActive(true);
                }}
              >
                drag anywhere
              </Text>
            </Text>
          </Box>
        </Stack>
      </Dropzone>
    </>
  );
}

function SearchPanel({
  onLoadingStart,
  searchActive,
  setSearchActive,
}: {
  onLoadingStart: (loading: boolean) => void;
  searchActive: boolean;
  setSearchActive: (active: boolean) => void;
}) {
  const { openPlayer } = useAppContext();
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`) ?? false;
  const contentMinH = panelContentMinHeight(isMobile);
  const [results, setResults] = useState<YouTubeResult[]>([]);
  /** Query string that produced the current `results` (avoids picking #1 on stale lists). */
  const [resultsForQuery, setResultsForQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const focusedRef = useRef(false);
  const form = useForm({ initialValues: { query: "" } });
  const query = form.values.query.trim();
  const isLink = isYoutubeURL(query) || isDirectMediaURL(query);
  const rightSectionWidth = isLink ? (isMobile ? 54 : 64) : isMobile ? 12 : 16;

  // Shimmer only while a search request is in flight — not while typing
  const showSkeleton = !isLink && loading;
  const showEmpty = !isLink && hasSearched && results.length === 0 && !loading;
  const showResultCards = !isLink && hasSearched && results.length > 0 && !loading;
  const showPressHint =
    query.length > 0 && !loading && !showSkeleton && !showResultCards && !showEmpty;

  function updateSearchActive(nextFocused: boolean, nextQuery: string) {
    const cleanQuery = nextQuery.trim();
    const hasQuery = cleanQuery.length > 0;
    const hasVisibleResults = results.length > 0 || hasSearched || loading;
    // Keep the sheet open for any non-empty query (incl. 1 char + links)
    setSearchActive(hasQuery && (nextFocused || hasVisibleResults || hasQuery));
  }

  const search = useCallback(
    async (value: string, signal?: AbortSignal, showErrors = true) => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(value)}&limit=3`,
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
      // sessionStorage may be full or unavailable — proceed without cache
    }
    resetSearchUi();
    openPlayer({ url: `https://www.youtube.com/watch?v=${id}`, expand: true });
  }

  return (
    <Stack spacing={0} sx={{ flex: 1, minHeight: 0, display: "flex" }}>
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
            } else if (trimmed !== resultsForQuery) {
              // Typing a new query — clear prior results; fetch only on Enter
              setHasSearched(false);
              setResults([]);
            }
          }}
          onFocus={() => {
            focusedRef.current = true;
            updateSearchActive(true, form.values.query);
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
              border: `${rem(1)} solid ${t.fn.rgba(t.colors.gray[6], 0.26)}`,
              color: t.white,
              fontWeight: 400,
              fontSize: isMobile ? rem(15) : rem(16),
              "&::placeholder": { color: t.fn.rgba(t.colors.gray[4], 0.75) },
            },
            icon: {
              color: query ? accent(t, 3) : t.colors.gray[6],
              width: isMobile ? rem(38) : rem(44),
            },
          })}
        />
      </form>

      {searchActive ? (
        <Box
          mt={rem(12)}
          sx={{
            flex: 1,
            minHeight: rem(contentMinH),
            display: "flex",
            flexDirection: "column",
            overflow: "visible",
          }}
        >
          <Stack spacing="md" sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            {(showSkeleton || showResultCards) && (
              <Group position="apart" px={4} sx={{ flexShrink: 0 }}>
                <Text
                  transform="uppercase"
                  color="dimmed"
                  opacity={0.6}
                  fz={10}
                  weight={700}
                  lts={rem(1.2)}
                >
                  Top results
                </Text>
                <Group spacing={4} c="dimmed" opacity={0.6}>
                  <SiYoutube size={14} />
                  <Text weight={600} size="xs">
                    YouTube
                  </Text>
                </Group>
              </Group>
            )}
            <Stack
              spacing="md"
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                justifyContent: showPressHint || showEmpty ? "center" : "flex-start",
                alignItems: showPressHint || showEmpty ? "center" : "stretch",
              }}
            >
              {showSkeleton ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <Paper
                    key={index}
                    p="xs"
                    radius="sm"
                    w="100%"
                    sx={(th) => ({
                      backgroundColor: th.fn.rgba(th.colors.dark[9], 0.36),
                    })}
                  >
                    <Flex gap="lg" align="center">
                      <Skeleton
                        width={isMobile ? 80 : 100}
                        height={isMobile ? 56 : 60}
                        radius="sm"
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Skeleton height={16} radius="sm" />
                        <Skeleton height={12} radius="sm" width="45%" mt={rem(3)} />
                      </Box>
                    </Flex>
                  </Paper>
                ))
              ) : showPressHint ? (
                <Stack
                  spacing={isMobile ? "xs" : "sm"}
                  align="center"
                  justify="center"
                  ta="center"
                  sx={{ minHeight: rem(contentMinH) }}
                >
                  <Center
                    w={isMobile ? 38 : 48}
                    h={isMobile ? 38 : 48}
                    sx={(t) => ({
                      borderRadius: t.radius.md,
                      background: t.fn.rgba(t.colors.dark[5], 0.55),
                      color: t.colors.gray[4],
                    })}
                  >
                    {isLink ? (
                      <IconLink size={isMobile ? 20 : 26} stroke={1.5} />
                    ) : (
                      <IconSearch size={isMobile ? 20 : 26} stroke={1.5} />
                    )}
                  </Center>
                  <Box ta="center" px={isMobile ? 4 : 0}>
                    <Text size={isMobile ? "sm" : "md"} weight={600} color="white">
                      {isLink ? "Press Enter to play" : "Press Enter to search"}
                    </Text>
                    <Text
                      size={isMobile ? "xs" : "sm"}
                      color="dimmed"
                      mt={isMobile ? 4 : 6}
                      maw={360}
                    >
                      {isLink
                        ? "Open this YouTube or media link in the player"
                        : "Search YouTube, or paste a link to play it directly"}
                    </Text>
                  </Box>
                </Stack>
              ) : showEmpty ? (
                <Stack
                  spacing={isMobile ? "xs" : "sm"}
                  align="center"
                  justify="center"
                  ta="center"
                  sx={{ minHeight: rem(contentMinH) }}
                >
                  <Center
                    w={isMobile ? 38 : 48}
                    h={isMobile ? 38 : 48}
                    sx={(t) => ({
                      borderRadius: t.radius.md,
                      background: t.fn.rgba(t.colors.dark[5], 0.55),
                      color: t.colors.gray[4],
                    })}
                  >
                    <IconSearch size={isMobile ? 20 : 26} stroke={1.5} />
                  </Center>
                  <Box ta="center" px={isMobile ? 4 : 0}>
                    <Text size={isMobile ? "sm" : "md"} weight={600} color="white">
                      No videos found
                    </Text>
                    <Text
                      size={isMobile ? "xs" : "sm"}
                      color="dimmed"
                      mt={isMobile ? 4 : 6}
                      maw={360}
                    >
                      Try a different keyword or paste a YouTube link directly.
                    </Text>
                  </Box>
                </Stack>
              ) : showResultCards ? (
                results.map((result) => (
                  <Paper
                    key={result.id}
                    component="button"
                    type="button"
                    p="xs"
                    radius="sm"
                    onClick={() => playResult(result)}
                    sx={(th) => ({
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      textDecoration: "none",
                      color: "inherit",
                      cursor: "pointer",
                      backgroundColor: th.fn.rgba(th.colors.dark[9], 0.36),
                      border: `${rem(1)} solid transparent`,
                      boxShadow: `0 ${rem(12)} ${rem(28)} ${th.fn.rgba(th.black, 0.18)}`,
                      transition: "transform 150ms ease, border-color 150ms ease",
                      "&:hover": {
                        transform: "translateY(-2px)",
                        borderColor: th.fn.rgba(accent(th, 5), 0.45),
                      },
                    })}
                  >
                    <Flex gap="md" align="center">
                      <Box pos="relative" sx={{ flexShrink: 0 }}>
                        <Image
                          src={result.thumbnail}
                          alt=""
                          width={isMobile ? 80 : 100}
                          height={isMobile ? 56 : 60}
                          radius="sm"
                          fit="cover"
                          withPlaceholder
                          placeholder={
                            <Center h="100%">
                              <IconMusic size={24} />
                            </Center>
                          }
                        />
                        <Badge
                          pos="absolute"
                          right={6}
                          bottom={6}
                          color={result.isLive ? "red" : "dark"}
                          variant="filled"
                          radius="sm"
                          size="md"
                        >
                          {result.isLive ? "LIVE" : formatDuration(result.lengthSeconds)}
                        </Badge>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Text
                          color="white"
                          weight={600}
                          size={isMobile ? "sm" : "md"}
                          lineClamp={2}
                        >
                          {result.title}
                        </Text>
                        <Text color="dimmed" size="sm" mt={4} lineClamp={1}>
                          {result.author}
                          {formatViews(result.viewCount)
                            ? `  •  ${formatViews(result.viewCount)}`
                            : ""}
                        </Text>
                      </Box>
                    </Flex>
                  </Paper>
                ))
              ) : null}
            </Stack>
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

function FooterLinks() {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`) ?? false;
  const linkSx = (t: MantineTheme) => ({
    textDecoration: "none",
    opacity: 0.62,
    transition: "opacity 160ms ease, color 160ms ease, filter 160ms ease",
    fontSize: isMobile ? rem(14) : undefined,
    "&:hover": {
      opacity: 1,
      color: t.colors.gray[2],
      textDecoration: "none",
      filter: `drop-shadow(0 0 ${rem(10)} ${t.fn.rgba(accent(t, 4), 0.35)})`,
    },
  });
  const iconSz = isMobile ? 17 : 20;
  const ghSz = isMobile ? 16 : 18;

  return (
    <Group
      position="center"
      spacing={isMobile ? "md" : "xl"}
      pt={isMobile ? "md" : "lg"}
      pb={isMobile ? undefined : "lg"}
      c="dimmed"
      sx={(t) => ({
        flexShrink: 0,
        flexWrap: "wrap",
        ...(isMobile
          ? { paddingBottom: `calc(${t.spacing.md} + env(safe-area-inset-bottom, 0px))` }
          : {}),
      })}
    >
      <Anchor
        href="https://github.com/bgwastu/moonlit"
        target="_blank"
        color="dimmed"
        fw={600}
        size={isMobile ? "sm" : "md"}
        sx={linkSx}
      >
        <Group spacing="xs">
          <SiGithub size={ghSz} />
          GitHub
        </Group>
      </Anchor>
      <Anchor
        href="https://github.com/bgwastu/moonlit/issues"
        target="_blank"
        color="dimmed"
        fw={600}
        size={isMobile ? "sm" : "md"}
        sx={linkSx}
      >
        <Group spacing="xs">
          <IconAlertCircle size={iconSz} />
          Report Bugs
        </Group>
      </Anchor>
      <Anchor
        href="mailto:bagas@wastu.net?subject=Moonlit%20Feedback&body=Hi%20Bagas%2C%0A%0AI%20have%20some%20feedback%20for%20Moonlit%3A%0A"
        color="dimmed"
        fw={600}
        size={isMobile ? "sm" : "md"}
        sx={linkSx}
      >
        <Group spacing="xs">
          <IconMessage size={iconSz} />
          Feedback
        </Group>
      </Anchor>
    </Group>
  );
}

function Header({
  setCookiesOpened,
  setHistoryOpened,
  setResetOpened,
}: {
  setCookiesOpened: (o: boolean) => void;
  setHistoryOpened: (o: boolean) => void;
  setResetOpened: (o: boolean) => void;
}) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`) ?? false;
  return (
    <Box
      px="md"
      pb={isMobile ? "xs" : "sm"}
      pt={isMobile ? undefined : "md"}
      sx={(t) =>
        isMobile
          ? {
              paddingTop: `calc(${t.spacing.sm} + env(safe-area-inset-top, 0px))`,
            }
          : undefined
      }
    >
      <Container size="lg">
        <Flex justify="space-between" align="center">
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <Flex align="center" gap={12}>
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
      </Container>
    </Box>
  );
}

export default function UploadPage() {
  const theme = useMantineTheme();
  const isMobileLayout = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`) ?? false;
  const panelMinH = panelContentMinHeight(isMobileLayout);
  /** Divider + gap above dropzone on desktop (align with search panel math). */
  const localChromePx = 72;
  /** Mobile: short drop target; desktop: fill remaining space in tuned panel. */
  const uploadDropzoneMin = isMobileLayout
    ? 132
    : Math.max(panelMinH - localChromePx, 240);

  const [cookiesOpened, setCookiesOpened] = useState(false);
  const [historyOpened, setHistoryOpened] = useState(false);
  const [resetOpened, setResetOpened] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [searchActive, setSearchActive] = useState(false);

  return (
    <>
      <LoadingOverlay visible={globalLoading} message="Processing..." />
      <CookiesModal opened={cookiesOpened} onClose={() => setCookiesOpened(false)} />
      <HistoryModal
        opened={historyOpened}
        onClose={() => setHistoryOpened(false)}
        onLoadingStart={setGlobalLoading}
      />
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
        <Stack spacing={0} mih="100dvh">
          <Header
            setCookiesOpened={setCookiesOpened}
            setHistoryOpened={setHistoryOpened}
            setResetOpened={setResetOpened}
          />
          <Box
            sx={(t) => ({
              flex: 1,
              display: "flex",
              minHeight: isMobileLayout ? 0 : undefined,
              flexDirection: isMobileLayout ? "column" : "row",
              justifyContent: isMobileLayout ? "center" : "flex-start",
              alignItems: isMobileLayout ? "stretch" : "flex-start",
              paddingTop: isMobileLayout ? rem(8) : rem(16),
              paddingBottom: isMobileLayout ? rem(8) : rem(16),
              paddingLeft: rem(16),
              paddingRight: rem(16),
              [t.fn.largerThan("sm")]: {
                paddingTop: rem(16),
                paddingBottom: rem(16),
                paddingLeft: rem(24),
                paddingRight: rem(24),
              },
              [t.fn.largerThan("md")]: {
                paddingLeft: rem(16),
                paddingRight: rem(16),
              },
            })}
          >
            <Container
              size="md"
              w="100%"
              px={0}
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <Stack
                spacing={isMobileLayout ? rem(24) : rem(40)}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                }}
              >
                <Stack
                  spacing={isMobileLayout ? "sm" : "md"}
                  align="center"
                  ta="center"
                  sx={(t) => ({
                    opacity: searchActive ? 0.58 : 1,
                    transform: searchActive ? "scale(0.985)" : "scale(1)",
                    transition: "opacity 180ms ease, transform 180ms ease",
                    transformOrigin: "center bottom",
                    [t.fn.smallerThan("sm")]: {
                      transform: searchActive ? "scale(0.98)" : "scale(1)",
                    },
                  })}
                >
                  <Title
                    order={1}
                    fw={900}
                    mt={isMobileLayout ? rem(16) : rem(32)}
                    sx={(t) => ({
                      color: t.white,
                      fontSize: rem(36),
                      letterSpacing: rem(-1.2),
                      lineHeight: 1.1,
                      [t.fn.smallerThan("sm")]: {
                        fontSize: rem(24),
                        letterSpacing: rem(-0.8),
                      },
                    })}
                  >
                    Transform your audio.
                  </Title>
                  <Text
                    maw={640}
                    ta="center"
                    color="dimmed"
                    size="lg"
                    sx={(t) => ({
                      lineHeight: 1.55,
                      [t.fn.smallerThan("sm")]: {
                        fontSize: t.fontSizes.sm,
                        lineHeight: 1.55,
                        padding: `0 ${rem(8)}`,
                      },
                    })}
                  >
                    Apply slowed + reverb, nightcore, or custom pitch shifts instantly to
                    YouTube links or local files.
                  </Text>
                </Stack>

                <Paper
                  p={{ base: "sm", sm: "md" }}
                  radius="md"
                  sx={{
                    backgroundColor: "#222528",
                    border: `${rem(1)} solid #33363D`,
                    flex: searchActive ? 1 : undefined,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: searchActive ? 0 : undefined,
                  }}
                >
                  <Stack
                    spacing={0}
                    sx={(t) => ({
                      gap: t.spacing.xs,
                      [t.fn.largerThan("sm")]: { gap: t.spacing.sm },
                      transition: "gap 180ms ease",
                      flex: searchActive ? 1 : undefined,
                      minHeight: searchActive ? 0 : undefined,
                    })}
                  >
                    <SearchPanel
                      onLoadingStart={setGlobalLoading}
                      searchActive={searchActive}
                      setSearchActive={setSearchActive}
                    />
                    {!searchActive && (
                      <Box
                        sx={{
                          ...(isMobileLayout ? {} : { minHeight: rem(panelMinH) }),
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <Stack
                          spacing={0}
                          sx={(t) => ({
                            gap: t.spacing.sm,
                            [t.fn.largerThan("sm")]: { gap: t.spacing.md },
                            flex: 1,
                            transition: "opacity 180ms ease, transform 180ms ease",
                          })}
                        >
                          <Divider
                            label="OR"
                            labelPosition="center"
                            styles={(t) => ({
                              root: {
                                borderTopColor: isMobileLayout
                                  ? t.fn.rgba(t.colors.gray[5], 0.45)
                                  : t.fn.rgba(t.colors.gray[6], 0.5),
                                marginTop: rem(2),
                                marginBottom: rem(2),
                                paddingTop: isMobileLayout ? rem(2) : rem(4),
                                paddingBottom: isMobileLayout ? rem(2) : rem(4),
                              },
                              label: {
                                color: isMobileLayout
                                  ? t.colors.gray[3]
                                  : t.colors.gray[5],
                                fontWeight: 600,
                                letterSpacing: rem(1.5),
                                fontSize: isMobileLayout ? rem(12) : t.fontSizes.sm,
                              },
                            })}
                          />
                          <LocalUpload dropzoneMinHeight={uploadDropzoneMin} />
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                </Paper>
              </Stack>
            </Container>
          </Box>
          <FooterLinks />
        </Stack>
      </AppShell>
    </>
  );
}
