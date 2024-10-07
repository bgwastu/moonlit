"use client";

import LoadingOverlay from "@/components/LoadingOverlay";
import useNoSleep from "@/hooks/useNoSleep";
import {
  ActionIcon,
  Alert,
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
import { useState } from "react";
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
  const [noSleepEnabled, setNoSleepEnabled] = useNoSleep();

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
          setLoading({
            status: false,
            message: null,
          });

          setNoSleepEnabled(true);
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
          setLoading({
            status: false,
            message: null,
          });
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
  const [loading, setLoading] = useState(false);
  const form = useForm({
    initialValues: {
      url: "",
    },
    validate: {
      url: (value) =>
        !isYoutubeURL(value) ? "Must be YouTube or YouTube Music URL" : null,
    },
  });

  async function onSubmit(url: string) {
    setLoading(true);
    const id = getYouTubeId(url);
    if (!id) {
      setLoading(false);
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
        <Button size="lg" type="submit" loading={loading}>
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
              href="https://www.buymeacoffee.com/moonlitapp"
              target="_blank"
              size="lg"
              color="dark"
              title="Buy me a coffee"
              variant="transparent"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
              >
                <path
                  fill="currentColor"
                  d="m20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379c-.197-.069-.42-.098-.57-.241c-.152-.143-.196-.366-.231-.572c-.065-.378-.125-.756-.192-1.133c-.057-.325-.102-.69-.25-.987c-.195-.4-.597-.634-.996-.788a5.723 5.723 0 0 0-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 0 0-3.7.062c-.915.083-1.88.184-2.75.5c-.318.116-.646.256-.888.501c-.297.302-.393.77-.177 1.146c.154.267.415.456.692.58c.36.162.737.284 1.123.366c1.075.238 2.189.331 3.287.37c1.218.05 2.437.01 3.65-.118c.299-.033.598-.073.896-.119c.352-.054.578-.513.474-.834c-.124-.383-.457-.531-.834-.473c-.466.074-.96.108-1.382.146c-1.177.08-2.358.082-3.536.006a22.228 22.228 0 0 1-1.157-.107c-.086-.01-.18-.025-.258-.036c-.243-.036-.484-.08-.724-.13c-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 0 1 3.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145c.392.085.895.113 1.07.542c.055.137.08.288.111.431l.319 1.484a.237.237 0 0 1-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 0 1-4.743.295a37.059 37.059 0 0 1-4.699-.304c-.14-.017-.293-.042-.417-.06c-.326-.048-.649-.108-.973-.161c-.393-.065-.768-.032-1.123.161c-.29.16-.527.404-.675.701c-.154.316-.199.66-.267 1c-.069.34-.176.707-.135 1.056c.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0 0 11.343.376a.483.483 0 0 1 .535.53l-.071.697l-1.018 9.907c-.041.41-.047.832-.125 1.237c-.122.637-.553 1.028-1.182 1.171c-.577.131-1.165.2-1.756.205c-.656.004-1.31-.025-1.966-.022c-.699.004-1.556-.06-2.095-.58c-.475-.458-.54-1.174-.605-1.793l-.731-7.013l-.322-3.094c-.037-.351-.286-.695-.678-.678c-.336.015-.718.3-.678.679l.228 2.185l.949 9.112c.147 1.344 1.174 2.068 2.446 2.272c.742.12 1.503.144 2.257.156c.966.016 1.942.053 2.892-.122c1.408-.258 2.465-1.198 2.616-2.657c.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 0 1 .39-.426c.402-.078.787-.212 1.074-.518c.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233c-2.416.359-4.866.54-7.308.46c-1.748-.06-3.477-.254-5.207-.498c-.17-.024-.353-.055-.47-.18c-.22-.236-.111-.71-.054-.995c.052-.26.152-.609.463-.646c.484-.057 1.046.148 1.526.22c.577.088 1.156.159 1.737.212c2.48.226 5.002.19 7.472-.14c.45-.06.899-.13 1.345-.21c.399-.072.84-.206 1.08.206c.166.281.188.657.162.974a.544.544 0 0 1-.169.364zm-6.159 3.9c-.862.37-1.84.788-3.109.788a5.884 5.884 0 0 1-1.569-.217l.877 9.004c.065.78.717 1.38 1.5 1.38c0 0 1.243.065 1.658.065c.447 0 1.786-.065 1.786-.065c.783 0 1.434-.6 1.499-1.38l.94-9.95a3.996 3.996 0 0 0-1.322-.238c-.826 0-1.491.284-2.26.613z"
                ></path>
              </svg>
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
