"use client";
export const dynamic = "force-dynamic";

import LoadingOverlay from "@/components/LoadingOverlay";
import {
  Anchor,
  Box,
  Button,
  Center,
  Container,
  Divider,
  Flex,
  Header,
  Text,
  TextInput,
  rem,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconBrandYoutube,
  IconDotsVertical,
  IconLayoutBottombarExpand,
  IconMusicCheck,
  IconMusicPlus,
  IconMusicX,
} from "@tabler/icons-react";
import parse from "id3-parser";
import { convertFileToBuffer } from "id3-parser/lib/util";
import { atom, useAtom } from "jotai";
import { useRouter } from "next/navigation";
import Icon from "../components/Icon";
import { songAtom } from "../state";
import { isYoutubeURL } from "../utils";
import { usePostHog } from "posthog-js/react";
import { getSongFromYouTube } from "@/api";

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
            title: tags.title ?? files[0].name,
            author: tags.artist ?? "Unknown",
            coverUrl: imgSrc,
          };

          setSong({
            fileUrl: URL.createObjectURL(files[0]),
            metadata,
          }).then(() => {
            setLoading({
              status: false,
              message: null,
            });
            router.push("/player");
          });
        } else {
          setSong({
            fileUrl: URL.createObjectURL(files[0]),
            metadata: {
              title: files[0].name,
              author: "Unknown",
              coverUrl: "",
            },
          }).then(() => {
            setLoading({
              status: false,
              message: null,
            });
            router.push("/player");
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
  const [loading, setLoading] = useAtom(loadingAtom);
  const [, setSong] = useAtom(songAtom);
  const posthog = usePostHog();
  const form = useForm({
    initialValues: {
      url: "",
    },
    validate: {
      url: (value) =>
        !isYoutubeURL(value) ? "Must be YouTube or YouTube Music URL" : null,
    },
  });

  function fetchMusic(url: string) {
    posthog.capture("download_music");
    setLoading({
      status: true,
      message: "Downloading music, please wait...",
    });

    getSongFromYouTube(url)
      .then((song) => {
        setSong(song).then(() => {
          setLoading({
            status: false,
            message: null,
          });
          router.push("/player");
        });
      })
      .catch((e) => {
        console.error(e);
        notifications.show({
          title: "Download error",
          message: e.message,
        });
        setLoading({
          status: false,
          message: null,
        });
      });
  }

  return (
    <form onSubmit={form.onSubmit((values) => fetchMusic(values.url))}>
      <Flex direction="column" gap="md">
        <TextInput
          icon={<IconBrandYoutube />}
          placeholder="YouTube URL"
          size="lg"
          type="url"
          disabled={loading.status}
          {...form.getInputProps("url")}
        />
        <Button size="lg" type="submit" disabled={loading.status}>
          Load music from YouTube
        </Button>
      </Flex>
    </form>
  );
}

export default function UploadPage() {
  const [loading] = useAtom(loadingAtom);

  return (
    <>
      
      <LoadingOverlay visible={loading.status} message={loading.message} />
      <Box
        style={{
          position: "relative",
        }}
      >
        <Container size="sm" p="xl" mt="5dvh">
          <Flex direction="column" gap="xl">
            <Center mb="lg">
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
          <Text color="dimmed" mt="xl">
            Found bugs or want to suggest features?{" "}
            <Anchor href="mailto:bagas@wastu.net">Let us know</Anchor>
          </Text>
        </Container>
      </Box>
    </>
  );
}
