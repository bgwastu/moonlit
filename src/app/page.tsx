"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiTiktok, SiYoutube } from "@icons-pack/react-simple-icons";
import {
  ActionIcon,
  Anchor,
  AppShell,
  Box,
  Center,
  Container,
  Divider,
  Flex,
  Group,
  Image,
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
  IconArrowRight,
  IconCookie,
  IconHistory,
  IconMusic,
  IconTrash,
  IconUpload,
  IconWorld,
} from "@tabler/icons-react";
import parse from "id3-parser";
import { convertFileToBuffer } from "id3-parser/lib/util";
import { usePostHog } from "posthog-js/react";
import CookiesModal from "@/components/CookiesModal";
import HistoryModal from "@/components/HistoryModal";
import Icon from "@/components/Icon";
import LoadingOverlay from "@/components/LoadingOverlay";
import ResetModal from "@/components/ResetModal";
import { useAppContext } from "@/context/AppContext";
import useNoSleep from "@/hooks/useNoSleep";
import type { Media } from "@/interfaces";
import { getCookiesToUse } from "@/lib/cookies";
import {
  getTikTokCreatorAndVideoId,
  getYouTubeId,
  isDirectMediaURL,
  isSupportedURL,
  isTikTokURL,
  isYoutubeURL,
} from "@/utils";

export interface DemoTrack {
  url: string;
  coverUrl: string;
  title: string;
  artist: string;
  album: string;
}

function LocalUpload() {
  const [loading, setLoading] = useState<{ status: boolean; message: string | null }>({
    status: false,
    message: null,
  });
  const { setMedia } = useAppContext();
  const posthog = usePostHog();
  const router = useRouter();
  const [, noSleep] = useNoSleep();
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  return (
    <>
      <LoadingOverlay visible={loading.status} message={loading.message} />
      <Dropzone
        accept={["audio/mpeg", "video/mp4", "audio/wav"]}
        maxFiles={1}
        disabled={loading.status}
        onDrop={async (files) => {
          posthog?.capture("upload_music");
          setLoading({
            status: true,
            message: "Saving to library...",
          });

          // Generate stable ID for local file
          const fileId = `local-${Date.now()}`;
          const sourceUrl = `local:${fileId}:video`;

          // 1. Save Blob to Cache
          const { setMedia: cacheSetMedia, setMeta } = await import("@/utils/cache");
          await cacheSetMedia(sourceUrl, files[0]);

          // 2. Parse tags
          const tags = await convertFileToBuffer(files[0]).then(parse);
          let metadata: Media["metadata"];

          if (tags !== false) {
            let imgSrc = "";
            if (tags.image?.data) {
              const coverBlob = new Blob([new Uint8Array(tags.image.data)], {
                type: tags.image.mime,
              });
              imgSrc = URL.createObjectURL(coverBlob);
            }

            metadata = {
              id: fileId,
              title: tags.title ?? files[0].name,
              author: tags.artist ?? "Unknown",
              coverUrl: imgSrc || "",
            };
          } else {
            metadata = {
              id: fileId,
              title: files[0].name,
              author: "Unknown",
              coverUrl: "",
            };
          }

          // 3. Save Metadata to Cache
          await setMeta(`local:${fileId}`, metadata);

          // 4. Update State
          const blobUrl = URL.createObjectURL(files[0]);
          const newMedia: Media = {
            fileUrl: blobUrl,
            sourceUrl: sourceUrl, // Use cache key as stable identifier/sourceUrl
            metadata,
          };

          setMedia(newMedia);
          router.push("/player");
          setLoading({ status: false, message: null });
          noSleep.enable();
        }}
        onReject={(files) => console.log("rejected files", files)}
        sx={(theme) => ({
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: theme.radius.lg,
          padding: 0,
          transition: "all 0.2s ease",
          "&:hover": {
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            borderColor: "rgba(255, 255, 255, 0.12)",
          },
        })}
      >
        <Stack spacing="xs" align="center" justify="center" h={isMobile ? 140 : 180}>
          <Dropzone.Accept>
            <IconUpload
              size={isMobile ? "2.5rem" : "3rem"}
              stroke={1.5}
              color={theme.colors.violet[4]}
            />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconTrash
              size={isMobile ? "2.5rem" : "3rem"}
              stroke={1.5}
              color={theme.colors.red[5]}
            />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconMusic
              size={isMobile ? "2.5rem" : "3rem"}
              stroke={1.5}
              color={theme.colors.dark[2]}
            />
          </Dropzone.Idle>

          <Box>
            <Text
              size={isMobile ? "md" : "lg"}
              align="center"
              weight={500}
              color="dimmed"
            >
              Drop local file here
            </Text>
            <Text size={isMobile ? "xs" : "sm"} color="dimmed" align="center" mt={4}>
              Supports MP3, WAV, MP4
            </Text>
          </Box>
        </Stack>
      </Dropzone>
    </>
  );
}

function YoutubeUpload({
  onOpenCookies,
  onLoadingStart,
}: {
  onOpenCookies: () => void;
  onLoadingStart: (loading: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const form = useForm({
    initialValues: {
      url: "",
    },
    validate: {
      url: (value) =>
        !isSupportedURL(value)
          ? "Must be a YouTube, TikTok, or direct MP3/MP4 URL"
          : null,
    },
  });

  async function onSubmit(url: string) {
    setLoading(true);
    onLoadingStart(true);

    if (isTikTokURL(url)) {
      const { creator, videoId } = getTikTokCreatorAndVideoId(url);

      if (creator && videoId) {
        router.push(`/@${creator}/video/${videoId}`);
      } else {
        try {
          const { cookies } = await getCookiesToUse();
          const response = await fetch("/api/tiktok", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, metadataOnly: true, cookies }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to fetch TikTok metadata");
          }

          throw new Error("Could not parse TikTok URL. Please try again.");
        } catch (error) {
          setLoading(false);
          onLoadingStart(false);
          notifications.show({
            title: "Error",
            message: `${(error as Error).message || "Failed to load TikTok video"}. You can try downloading it manually and uploading it to Moonlit.`,
            color: "red",
            autoClose: 8000,
          });
          return;
        }
      }
    } else if (isYoutubeURL(url)) {
      const id = getYouTubeId(url);
      if (!id) {
        setLoading(false);
        onLoadingStart(false);
        notifications.show({
          title: "Error",
          message: "Invalid URL",
        });
        return;
      }
      router.push("/watch?v=" + id);
    } else if (isDirectMediaURL(url)) {
      router.push(`/player?url=${encodeURIComponent(url)}`);
    } else {
      setLoading(false);
      onLoadingStart(false);
      notifications.show({
        title: "Error",
        message: "Unsupported URL",
      });
    }
  }

  return (
    <form onSubmit={form.onSubmit((values) => onSubmit(values.url))}>
      <Stack spacing="md">
        <TextInput
          icon={
            form.values.url.includes("youtube") ? (
              <SiYoutube size={isMobile ? 18 : 20} />
            ) : form.values.url.includes("tiktok") ? (
              <SiTiktok size={isMobile ? 18 : 20} />
            ) : (
              <IconWorld size={isMobile ? 18 : 20} />
            )
          }
          placeholder="YouTube, TikTok, or MP3/MP4 URL..."
          size={isMobile ? "md" : "xl"}
          radius="md"
          variant="filled"
          rightSection={
            <ActionIcon
              size={isMobile ? "md" : "lg"}
              variant="filled"
              color="violet"
              loading={loading}
              onClick={() => form.onSubmit((values) => onSubmit(values.url))()}
              radius="md"
            >
              <IconArrowRight size={isMobile ? 18 : 20} />
            </ActionIcon>
          }
          rightSectionWidth={isMobile ? 42 : 52}
          styles={(theme) => ({
            input: {
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              "&:focus": {
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                borderColor: "rgba(255, 255, 255, 0.15)",
              },
            },
          })}
          {...form.getInputProps("url")}
        />
      </Stack>
    </form>
  );
}

function FooterLinks() {
  return (
    <Flex justify="center" align="center" gap="xs" py="md" style={{ flexShrink: 0 }}>
      <Anchor
        href="https://github.com/bgwastu/moonlit"
        target="_blank"
        color="dimmed"
        size="sm"
        sx={{ "&:hover": { textDecoration: "underline" } }}
      >
        GitHub
      </Anchor>
      <Text color="dark.6" size="sm">
        •
      </Text>
      <Anchor
        href="https://github.com/bgwastu/moonlit/issues"
        target="_blank"
        color="dimmed"
        size="sm"
        sx={{ "&:hover": { textDecoration: "underline" } }}
      >
        Report Bugs
      </Anchor>
      <Text color="dark.6" size="sm">
        •
      </Text>
      <Anchor
        href="mailto:bagas@wastu.net?subject=Moonlit%20Feedback&body=Hi%20Bagas%2C%0A%0AI%20have%20some%20feedback%20for%20Moonlit%3A%0A"
        color="dimmed"
        size="sm"
        sx={{ "&:hover": { textDecoration: "underline" } }}
      >
        Feedback
      </Anchor>
    </Flex>
  );
}

const FALLBACK_DEMO_TRACKS: DemoTrack[] = [
  {
    url: "/demo-1.mp3",
    coverUrl: "/demo-1-cover.jpg",
    title: "Demo 1",
    artist: "—",
    album: "",
  },
  {
    url: "/demo-2.mp3",
    coverUrl: "/demo-2-cover.jpg",
    title: "Demo 2",
    artist: "—",
    album: "",
  },
  {
    url: "/demo-3.mp3",
    coverUrl: "/demo-3-cover.jpg",
    title: "Demo 3",
    artist: "—",
    album: "",
  },
];

const DEMO_CARD_SIZE = 130;

function DemoTracksSection() {
  const { history } = useAppContext();
  const [tracks, setTracks] = useState<DemoTrack[]>(FALLBACK_DEMO_TRACKS);

  useEffect(() => {
    fetch("/demo-tracks.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tracks?: DemoTrack[] } | null) => {
        if (data?.tracks?.length) setTracks(data.tracks);
      })
      .catch(() => {});
  }, []);

  if (history.length > 1) return null;

  return (
    <Stack spacing="xs" align="center">
      <Text size="sm" c="dimmed" fw={500}>
        Try a demo
      </Text>
      <Group spacing="xs" position="center">
        {tracks.map((track) => (
          <Anchor
            key={track.url}
            component={Link}
            href={`/player?url=${encodeURIComponent(track.url)}`}
            sx={{ textDecoration: "none" }}
          >
            <Box
              sx={(t) => ({
                width: DEMO_CARD_SIZE,
                height: DEMO_CARD_SIZE,
                borderRadius: t.radius.md,
                overflow: "hidden",
                position: "relative",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                transition: "all 0.2s ease",
                "&:hover": {
                  borderColor: "rgba(255, 255, 255, 0.25)",
                  transform: "scale(1.05)",
                },
              })}
            >
              <Image
                src={track.coverUrl}
                alt=""
                width={DEMO_CARD_SIZE}
                height={DEMO_CARD_SIZE}
                fit="cover"
                withPlaceholder
                placeholder={
                  <Center style={{ height: "100%", background: "rgba(0,0,0,0.3)" }}>
                    <IconMusic size={24} stroke={1.5} color="rgba(255,255,255,0.4)" />
                  </Center>
                }
              />
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
                p="xs"
              >
                <Text size="xs" fw={600} lineClamp={1} color="white">
                  {track.title}
                </Text>
                <Text size="xs" lineClamp={1} color="rgba(255,255,255,0.8)">
                  {track.artist}
                </Text>
              </Box>
            </Box>
          </Anchor>
        ))}
      </Group>
    </Stack>
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
  return (
    <Box py="md" px="md">
      <Container size="md">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap={10}>
            <Icon size={20} />
            <Text
              fz={rem(18)}
              fw={600}
              style={{ userSelect: "none", letterSpacing: "-0.01em" }}
            >
              Moonlit
            </Text>
          </Flex>

          <Group spacing="xs">
            {/* Icons */}
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
  const [cookiesOpened, setCookiesOpened] = useState(false);
  const [historyOpened, setHistoryOpened] = useState(false);
  const [resetOpened, setResetOpened] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  return (
    <>
      <style global jsx>{`
        @keyframes gradient {
          0% {
            background-position: 0% 0%;
          }
          50% {
            background-position: 100% 100%;
          }
          100% {
            background-position: 0% 0%;
          }
        }
      `}</style>
      <LoadingOverlay visible={globalLoading} message="Loading video..." />
      <CookiesModal opened={cookiesOpened} onClose={() => setCookiesOpened(false)} />
      <HistoryModal
        opened={historyOpened}
        onClose={() => setHistoryOpened(false)}
        onLoadingStart={setGlobalLoading}
      />
      <ResetModal opened={resetOpened} onClose={() => setResetOpened(false)} />

      <AppShell
        padding={0}
        styles={{
          main: {
            background:
              "radial-gradient(circle at 50% 120%, rgba(120, 50, 220, 0.45) 0%, rgba(20, 20, 30, 0) 50%), radial-gradient(circle at 50% -20%, rgba(120, 50, 220, 0.25) 0%, #1A1B1E 60%)",
            backgroundSize: "300% 300%",
            animation: "gradient 10s ease infinite",
            minHeight: "100dvh",
          },
        }}
      >
        <Stack spacing={0} h="100%" style={{ minHeight: "100dvh" }}>
          <Header
            setCookiesOpened={setCookiesOpened}
            setHistoryOpened={setHistoryOpened}
            setResetOpened={setResetOpened}
          />

          <Box
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "2rem 0 3rem",
            }}
          >
            <Stack spacing={48} w="100%">
              <Container size="sm" w="100%">
                <Stack spacing="lg">
                  {/* Hero */}
                  <Stack spacing="md" align="center" ta="center">
                    <Title
                      order={1}
                      size={rem(40)}
                      fw={700}
                      sx={(theme) => ({
                        color: "white",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.15,
                        [theme.fn.smallerThan("sm")]: { fontSize: rem(28) },
                      })}
                    >
                      Play it your way
                    </Title>
                    <Text
                      size="md"
                      maw={380}
                      mx="auto"
                      sx={(theme) => ({
                        color: theme.colors.dark[2],
                        lineHeight: 1.5,
                        [theme.fn.smallerThan("sm")]: { fontSize: theme.fontSizes.sm },
                      })}
                    >
                      Slowed + reverb, nightcore, and pitch control. Paste a link or drop
                      a file.
                    </Text>
                  </Stack>

                  <YoutubeUpload
                    onOpenCookies={() => setCookiesOpened(true)}
                    onLoadingStart={setGlobalLoading}
                  />

                  <DemoTracksSection />
                </Stack>
              </Container>

              <Box w="100%" px="md">
                <Divider
                  label="or drop a file"
                  labelPosition="center"
                  color="dark.5"
                  styles={{
                    label: {
                      color: "var(--mantine-color-dark-4)",
                      fontSize: "var(--mantine-font-size-xs)",
                      "&::before": { borderTopColor: "rgba(255,255,255,0.06)" },
                      "&::after": { borderTopColor: "rgba(255,255,255,0.06)" },
                    },
                  }}
                />
                <LocalUpload />
              </Box>
            </Stack>
          </Box>

          <FooterLinks />
        </Stack>
      </AppShell>
    </>
  );
}
