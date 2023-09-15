"use client";

import {
  Box,
  Button,
  Center,
  Container,
  Divider,
  Flex,
  LoadingOverlay,
  Text,
  TextInput,
  rem,
} from "@mantine/core";
import { atom, useAtom } from "jotai";
import { songAtom } from "../state";
import { useForm } from "@mantine/form";
import { isYoutubeURL } from "../utils";
import { IconBrandYoutube } from "@tabler/icons-react";
import Icon from "../components/Icon";
import { notifications } from "@mantine/notifications";
import { Dropzone } from "@mantine/dropzone";
import { convertFileToBuffer } from "id3-parser/lib/util";
import parse from "id3-parser";
import { IconMusicPlus, IconMusicCheck, IconMusicX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

const loadingAtom = atom(false);

function LocalUpload() {

  
  const [loading, setLoading] = useAtom(loadingAtom);
  const [, setSong] = useAtom(songAtom);
  const router = useRouter();
  return (
    <Dropzone
      accept={["audio/mpeg"]}
      maxFiles={1}
      disabled={loading}
      onDrop={async (files) => {
        setLoading(true);
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
            setLoading(false);
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
            setLoading(false);
            router.push("/player");
          });
        }
      }}
      onReject={(files) => {
        setLoading(false);
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
    setLoading(true);
    fetch("/api/yt", {
      method: "POST",
      body: JSON.stringify({
        url,
      }),
      headers: {
        "content-type": "application/json",
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error("Error when fetching data from YouTube");
          console.error(res);
          notifications.show({
            title: "Download error",
            message: "Error when fetching data from Youtube",
          });
        }

        const blob = await res.blob();

        setSong({
          fileUrl: URL.createObjectURL(blob),
          metadata: {
            title: decodeURI(res.headers.get("Title") ?? "Unknown"),
            author: decodeURI(res.headers.get("Author") ?? "Unknown"),
            coverUrl: decodeURI(res.headers.get("Thumbnail") ?? ""),
          },
        }).then(() => {
          setLoading(false);
          router.push("/player");
        });
      })
      .catch((e) => {
        console.error(e);
        notifications.show({
          title: "Download error",
          message: "Error when fetching data from YouTube",
        });
        setLoading(false);
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
          disabled={loading}
          {...form.getInputProps("url")}
        />
        <Button size="lg" type="submit" disabled={loading}>
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
      <LoadingOverlay visible={loading} />
      <Box
        style={{
          position: "relative",
        }}
      >
        <Container size="sm" p="xl">
          <Flex direction="column" gap="xl" mt="md">
            <Center>
              <Flex gap="sm" align="center">
                <Icon />
                <Text
                  fz={rem(26)}
                  fw="bold"
                  lts={rem(1)}
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
      </Box>
    </>
  );
}
