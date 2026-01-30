"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SiTiktok, SiYoutube } from "@icons-pack/react-simple-icons";
import {
  ActionIcon,
  Anchor,
  AppShell,
  Button,
  Container,
  Divider,
  Flex,
  Footer,
  Stack,
  Text,
  TextInput,
  Tooltip,
  rem,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconBrandGithub,
  IconCookie,
  IconHistory,
  IconMusicCheck,
  IconMusicPlus,
  IconMusicX,
  IconWorld,
} from "@tabler/icons-react";
import parse from "id3-parser";
import { convertFileToBuffer } from "id3-parser/lib/util";
import { usePostHog } from "posthog-js/react";
import CookiesModal from "@/components/CookiesModal";
import HistoryModal from "@/components/HistoryModal";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useAppContext } from "@/context/AppContext";
import useNoSleep from "@/hooks/useNoSleep";
import type { Media } from "@/interfaces";
import { getCookiesToUse } from "@/lib/cookies";
import Icon from "../components/Icon";
import {
  getTikTokCreatorAndVideoId,
  getYouTubeId,
  isSupportedURL,
  isTikTokURL,
  isYoutubeURL,
} from "../utils";

function LocalUpload() {
  const [loading, setLoading] = useState<{ status: boolean; message: string | null }>({
    status: false,
    message: null,
  });
  const { setMedia } = useAppContext();
  const posthog = usePostHog();
  const router = useRouter();
  const [, noSleep] = useNoSleep();

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
          const sourceUrl = `local:${fileId}:video`; // Storing as "video" generic media

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
      >
        <Flex align="center" justify="center" gap="sm" mih={220} h="100%">
          <Dropzone.Accept>
            <IconMusicCheck size="3.2rem" stroke={1.5} />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconMusicX size="3.2rem" stroke={1.5} />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconMusicPlus size="3.2rem" stroke={1.5} />
          </Dropzone.Idle>

          <div>
            <Text size="xl" inline>
              Drag music here or click to select files
            </Text>
            <Text size="sm" color="dimmed" inline mt={7}>
              Upload a music/video file to play with custom effects
            </Text>
          </div>
        </Flex>
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
      <Flex direction="column" gap="md">
        <TextInput
          icon={
            form.values.url.includes("youtube") ? (
              <SiYoutube size={20} />
            ) : form.values.url.includes("tiktok") ? (
              <SiTiktok size={20} />
            ) : (
              <IconWorld />
            )
          }
          placeholder="YouTube or TikTok URL"
          size="lg"
          type="url"
          {...form.getInputProps("url")}
        />
        <Button size="lg" type="submit" loading={loading}>
          Download & Play
        </Button>
      </Flex>
    </form>
  );
}

function FooterSection() {
  return (
    <Footer height={60} p="md">
      <Container size="lg">
        <Flex justify="space-between" align="center">
          <Text color="dimmed" size="sm">
            Have any feedback? Email:{" "}
            <Anchor href="mailto:bagas@wastu.net">bagas@wastu.net</Anchor>
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            component="a"
            href="https://github.com/bgwastu/moonlit"
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconBrandGithub size={18} />
          </ActionIcon>
        </Flex>
      </Container>
    </Footer>
  );
}

export default function UploadPage() {
  const [cookiesOpened, setCookiesOpened] = useState(false);
  const [historyOpened, setHistoryOpened] = useState(false);

  return (
    <>
      <CookiesModal opened={cookiesOpened} onClose={() => setCookiesOpened(false)} />
      <HistoryModal opened={historyOpened} onClose={() => setHistoryOpened(false)} />

      <AppShell footer={<FooterSection />} mt={28}>
        <Container size="sm">
          <Flex direction="column" gap={28}>
            <Stack align="center" my={12}>
              <Flex gap={6} align="center" justify="center" w="100%">
                <Flex gap={12} align="center">
                  <Icon size={24} />
                  <Text
                    fz={rem(28)}
                    fw="bold"
                    lts={rem(0.2)}
                    style={{ userSelect: "none" }}
                  >
                    Moonlit
                  </Text>
                </Flex>
                <Tooltip label="Cookies Settings" position="bottom">
                  <ActionIcon
                    variant="subtle"
                    color="violet"
                    size="lg"
                    onClick={() => setCookiesOpened(true)}
                    ml="xs"
                  >
                    <IconCookie size={20} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="History" position="bottom">
                  <ActionIcon
                    variant="subtle"
                    color="violet"
                    size="lg"
                    onClick={() => setHistoryOpened(true)}
                  >
                    <IconHistory size={20} />
                  </ActionIcon>
                </Tooltip>
              </Flex>
            </Stack>
            <YoutubeUpload onOpenCookies={() => setCookiesOpened(true)} />
            <Divider label="OR" labelPosition="center" />
            <LocalUpload />
          </Flex>
        </Container>
      </AppShell>
    </>
  );
}
