"use client";

import LoadingOverlay from "@/components/LoadingOverlay";
import useNoSleep from "@/hooks/useNoSleep";
import { Song } from "@/interfaces";
import {
  ActionIcon,
  Anchor,
  AppShell,
  Button,
  Center,
  Container,
  Divider,
  Flex,
  Footer,
  Text,
  TextInput,
  rem,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconBrandYoutube,
  IconBrandGithub,
  IconMusicCheck,
  IconMusicPlus,
  IconMusicX,
} from "@tabler/icons-react";
import parse from "id3-parser";
import { convertFileToBuffer } from "id3-parser/lib/util";
import { atom, useAtom, WritableAtom } from "jotai";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import Icon from "../components/Icon";
import { songAtom } from "../state";
import { getYouTubeId, getTikTokCreatorAndVideoId, isSupportedURL, isTikTokURL } from "../utils";

const loadingAtom = atom<{
  status: boolean;
  message: string | null;
}>({
  status: false,
  message: null,
});

function LocalUpload() {
  const [loading, setLoading] = useAtom(loadingAtom);
  const [song, setSong] = useAtom(songAtom);
  const posthog = usePostHog();
  const router = useRouter();
  const [, setNoSleepEnabled] = useNoSleep();

  // Direct call to avoid type issues
  const handleSetSong = (newSong: Song) => {
    // Force the call by casting the function type
    (setSong as (song: Song | null) => void)(newSong);
  };

  return (
    <Dropzone
      accept={["audio/mpeg", "video/mp4"]}
      maxFiles={1}
      disabled={loading.status}
      onDrop={async (files) => {
        posthog.capture("upload_music");
        setLoading({
          status: true,
          message: "Reading music file, please wait...",
        });
        const tags = await convertFileToBuffer(files[0]).then(parse);
        if (tags !== false) {
          let imgSrc = "";

          if (tags.image?.data) {
            const coverBlob = new Blob([new Uint8Array(tags.image.data)], {
              type: tags.image.mime,
            });
            imgSrc = URL.createObjectURL(coverBlob);
          }

          const metadata = {
            id: null,
            title: tags.title ?? files[0].name,
            author: tags.artist ?? "Unknown",
            coverUrl: imgSrc || "",
          };

          const newSong: Song = {
            fileUrl: URL.createObjectURL(files[0]),
            metadata,
          };
          handleSetSong(newSong);
          router.push("/player");
          setLoading({
            status: false,
            message: null,
          });

          setNoSleepEnabled(true);
        } else {
          const newSong: Song = {
            fileUrl: URL.createObjectURL(files[0]),
            metadata: {
              id: null,
              title: files[0].name,
              author: "Unknown",
              coverUrl: "",
            },
          };
          handleSetSong(newSong);
          router.push("/player");
          setLoading({
            status: false,
            message: null,
          });
        }
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
  );
}

function YoutubeUpload() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const form = useForm({
    initialValues: {
      url: "",
    },
    validate: {
      url: (value) =>
        !isSupportedURL(value) ? "Must be YouTube or TikTok URL" : null,
    },
  });

  async function onSubmit(url: string) {
    setLoading(true);
    
    if (isTikTokURL(url)) {
      // For TikTok URLs, extract creator and video ID and redirect to new route structure
      const { creator, videoId } = getTikTokCreatorAndVideoId(url);
      
      if (creator && videoId) {
        router.push(`/@${creator}/video/${videoId}`);
      } else {
        // Fallback to old player method if extraction fails
        try {
          const response = await fetch("/api/tiktok", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, metadataOnly: true }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to fetch TikTok metadata");
          }

          // Since /player is now for local files only, we need to handle TikTok differently
          // For now, just show an error if creator/videoId extraction fails
          throw new Error("Could not parse TikTok URL. Please try again.");
        } catch (error) {
          setLoading(false);
          notifications.show({
            title: "Error",
            message: error.message || "Failed to load TikTok video",
          });
          return;
        }
      }
    } else {
      // YouTube URL handling
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
    }
  }

  return (
    <form onSubmit={form.onSubmit((values) => onSubmit(values.url))}>
      <Flex direction="column" gap="md">
        <TextInput
          icon={<IconBrandYoutube />}
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
            Have any feedback? Email: {" "}
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
  const [loading] = useAtom(loadingAtom);

  return (
    <>
      <LoadingOverlay visible={loading.status} message={loading.message} />

      <AppShell footer={<FooterSection />} mt={28}>
        <Container size="sm">
          <Flex direction="column" gap="xl">
            <Center>
              <Flex gap={6} align="center">
                <Icon size={24} />
                <Text
                  fz={rem(28)}
                  fw="bold"
                  lts={rem(0.2)}
                  style={{
                    userSelect: "none",
                  }}
                >
                  Moonlit
                </Text>
              </Flex>
            </Center>
            <YoutubeUpload />
            <Divider label="OR" labelPosition="center" />
            <LocalUpload />
          </Flex>
        </Container>
      </AppShell>
    </>
  );
}
