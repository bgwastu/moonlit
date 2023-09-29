"use client";

import LoadingOverlay from "@/components/LoadingOverlay";
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
  useMantineTheme,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconAt,
  IconBrandYoutube,
  IconExternalLink,
  IconMusicCheck,
  IconMusicPlus,
  IconMusicX,
} from "@tabler/icons-react";
import parse from "id3-parser";
import { convertFileToBuffer } from "id3-parser/lib/util";
import { atom, useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import Icon from "../components/Icon";
import { songAtom } from "../state";
import { getYouTubeId, isYoutubeURL } from "../utils";

const loadingAtom = atom<{
  status: boolean;
  message: string | null;
}>({
  status: false,
  message: null,
});

function LocalUpload() {
  const [loading, setLoading] = useAtom(loadingAtom);
  const [, setSong] = useAtom(songAtom);
  const posthog = usePostHog();
  const router = useRouter();
  return (
    <Dropzone
      accept={["audio/mpeg"]}
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
            coverUrl: imgSrc,
          };

          setSong({
            fileUrl: URL.createObjectURL(files[0]),
            metadata,
          });
          router.push("/player");
        } else {
          setSong({
            fileUrl: URL.createObjectURL(files[0]),
            metadata: {
              id: null,
              title: files[0].name,
              author: "Unknown",
              coverUrl: "",
            },
          });
          router.push("/player");
        }
      }}
      onReject={(files) => {
        setLoading({
          status: false,
          message: null,
        });
        files[0].errors.forEach((e) => {
          notifications.show({
            title: "Error",
            message: e.message,
          });
        });
      }}
    >
      <Flex
        align="center"
        justify="center"
        gap="md"
        mih={220}
        style={{ pointerEvents: "none" }}
      >
        <Dropzone.Accept>
          <IconMusicCheck />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconMusicX />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <IconMusicPlus />
        </Dropzone.Idle>

        <div>
          <Text size="xl" inline>
            Upload music file here
          </Text>
          <Text size="sm" color="dimmed" inline mt={7}>
            Drag & drop the file or just click this window
          </Text>
        </div>
      </Flex>
    </Dropzone>
  );
}

function YoutubeUpload() {
  const router = useRouter();
  const form = useForm({
    initialValues: {
      url: "",
    },
    validate: {
      url: (value) =>
        !isYoutubeURL(value) ? "Must be YouTube or YouTube Music URL" : null,
    },
  });

  function onSubmit(url: string) {
    const id = getYouTubeId(url);
    if (!id) {
      notifications.show({
        title: "Error",
        message: "Invalid YouTube URL",
      });
      return;
    }

    router.push("/watch?v=" + id);
  }

  return (
    <form onSubmit={form.onSubmit((values) => onSubmit(values.url))}>
      <Flex direction="column" gap="md">
        <TextInput
          icon={<IconBrandYoutube />}
          placeholder="YouTube URL"
          size="lg"
          type="url"
          {...form.getInputProps("url")}
        />
        <Button size="lg" type="submit">
          Load music from YouTube
        </Button>
      </Flex>
    </form>
  );
}

function FooterSection() {
  const theme = useMantineTheme();
  return (
    <Footer height={68}>
      <Container size="sm" h="100%">
        <Flex align="center" justify="space-between" h="100%">
          <Flex direction="column">
            <Anchor
              size="sm"
              color="subtle"
              href="https://github.com/bgwastu/moonlit/issues"
              target="_blank"
            >
              Feature Request & Bug Report <IconExternalLink size={14} />
            </Anchor>
          </Flex>
          <Flex gap={4}>
            <ActionIcon
              component="a"
              href="mailto:bagas@wastu.net?subject=Moonlit"
              target="_blank"
              size="lg"
              color="dark"
              title="GitHub"
              variant="transparent"
            >
              <IconAt />
            </ActionIcon>
            <ActionIcon
              component="a"
              href="https://github.com/bgwastu/moonlit"
              target="_blank"
              size="lg"
              color="dark"
              title="GitHub"
              variant="transparent"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  fill="currentColor"
                  d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33c.85 0 1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"
                ></path>
              </svg>
            </ActionIcon>
          </Flex>
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

      <AppShell footer={<FooterSection />} fixed={false} mt={28}>
        <Container size="sm" p="xl">
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
