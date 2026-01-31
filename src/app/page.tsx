"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SiTiktok, SiYoutube } from "@icons-pack/react-simple-icons";
import {
  ActionIcon,
  Anchor,
  AppShell,
  Box,
  Button,
  Center,
  Container,
  Flex,
  Footer,
  Group,
  Paper,
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
import { notifications } from "@mantine/notifications";
import {
  IconArrowRight,
  IconBrandGithub,
  IconCookie,
  IconHistory,
  IconMusic,
  IconMusicUp,
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
  isSupportedURL,
  isTikTokURL,
  isYoutubeURL,
} from "@/utils";

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

  return (
    <>
      <LoadingOverlay visible={loading.status} message={loading.message} />
      <Dropzone
        accept={["audio/mpeg", "video/mp4", "audio/wav"]}
        maxFiles={1}
        disabled={loading.status}
        onDrop={async (files) => {
          posthog.capture("upload_music");
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
            sourceUrl: sourceUrl,
            metadata,
          };

          setMedia(newMedia);
          router.push("/player");
          setLoading({ status: false, message: null });
          noSleep.enable();
        }}
        onReject={(files) => console.log("rejected files", files)}
        sx={(theme) => ({
          backgroundColor: theme.colors.dark[6],
          border: `1px solid ${theme.colors.dark[5]}`,
          borderRadius: theme.radius.lg,
          padding: 0,
          transition: "all 0.2s ease",
          "&:hover": {
            backgroundColor: theme.colors.dark[5],
            borderColor: theme.colors.violet[5],
          },
        })}
      >
        <Stack spacing="xs" align="center" justify="center" h={180}>
          <Dropzone.Accept>
            <IconUpload size="3rem" stroke={1.5} color={theme.colors.violet[4]} />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconTrash size="3rem" stroke={1.5} color={theme.colors.red[5]} />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconMusic size="3rem" stroke={1.5} color={theme.colors.dark[2]} />
          </Dropzone.Idle>

          <Box>
            <Text size="lg" align="center" weight={500} color="dimmed">
              Drop local file here
            </Text>
            <Text size="sm" color="dimmed" align="center" mt={4}>
              Supports MP3, WAV, MP4
            </Text>
          </Box>
        </Stack>
      </Dropzone>
    </>
  );
}

function YoutubeUpload({ onOpenCookies }: { onOpenCookies: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const form = useForm({
    initialValues: {
      url: "",
    },
    validate: {
      url: (value) => (!isSupportedURL(value) ? "Must be YouTube or TikTok URL" : null),
    },
  });

  async function onSubmit(url: string) {
    setLoading(true);

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
        notifications.show({
          title: "Error",
          message: "Invalid URL",
        });
        return;
      }
      router.push("/watch?v=" + id);
    } else {
      setLoading(false);
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
              <SiYoutube size={20} />
            ) : form.values.url.includes("tiktok") ? (
              <SiTiktok size={20} />
            ) : (
              <IconWorld size={20} />
            )
          }
          placeholder="Paste YouTube or TikTok URL..."
          size="xl"
          radius="md"
          variant="filled"
          rightSection={
            <ActionIcon
              size="lg"
              variant="filled"
              color="violet"
              loading={loading}
              onClick={() => form.onSubmit((values) => onSubmit(values.url))()}
              radius="md"
            >
              <IconArrowRight size={20} />
            </ActionIcon>
          }
          rightSectionWidth={52}
          styles={(theme) => ({
            input: {
              backgroundColor: theme.colors.dark[6],
              "&:focus": {
                backgroundColor: theme.colors.dark[5],
              },
            },
          })}
          {...form.getInputProps("url")}
        />
      </Stack>
    </form>
  );
}

function FooterSection() {
  return (
    <Footer height={60} p="md" sx={{ borderTop: "none" }}>
      <Container size="md">
        <Flex justify="center" align="center" gap="xs">
          <Text color="dimmed" size="sm">
            Moonlit
          </Text>
          <Text color="dark.6" size="sm">
            •
          </Text>
          <Anchor
            href="https://github.com/bgwastu/moonlit"
            target="_blank"
            color="dimmed"
            size="sm"
          >
            GitHub
          </Anchor>
          <Text color="dark.6" size="sm">
            •
          </Text>
          <Anchor href="mailto:bagas@wastu.net" color="dimmed" size="sm">
            Feedback
          </Anchor>
        </Flex>
      </Container>
    </Footer>
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
    <Box py="lg">
      <Container size="md">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap="sm">
            <Icon size={24} />
            <Text fw={700} size="lg" style={{ userSelect: "none" }}>
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

  return (
    <>
      <CookiesModal opened={cookiesOpened} onClose={() => setCookiesOpened(false)} />
      <HistoryModal opened={historyOpened} onClose={() => setHistoryOpened(false)} />
      <ResetModal opened={resetOpened} onClose={() => setResetOpened(false)} />

      <AppShell
        footer={<FooterSection />}
        padding={0}
        styles={{
          main: {
            background:
              "linear-gradient(180deg, rgba(26,27,30,0) 0%, rgba(26,27,30,1) 100%)", // Very subtle fade if anything, or just transparent
          },
        }}
      >
        <Stack spacing={0} h="100%">
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
            }}
          >
            <Container size="xs" w="100%">
              <Stack spacing={40}>
                {/* Hero Text */}
                <Stack spacing="xs" align="center" ta="center">
                  <Title order={1} size={42} fw={800} color="white">
                    Play it your way.
                  </Title>
                  <Text size="lg" c="dimmed" maw={400} mx="auto">
                    Transform your music with real-time slowed + reverb and nightcore
                    effects.
                  </Text>
                </Stack>

                {/* Main Action Area */}
                <Stack spacing="lg">
                  <YoutubeUpload onOpenCookies={() => setCookiesOpened(true)} />

                  <Center>
                    <Text size="sm" c="dimmed" fw={500}>
                      OR
                    </Text>
                  </Center>

                  <LocalUpload />
                </Stack>
              </Stack>
            </Container>
          </Box>
        </Stack>
      </AppShell>
    </>
  );
}
