"use client";
export const dynamic = "force-dynamic";

import LoadingOverlay from "@/components/LoadingOverlay";
import { songAtom } from "@/state";
import { isYoutubeURL } from "@/utils";
import { Button, Center, Container, Flex, Image, Text } from "@mantine/core";
import { useShallowEffect } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconMusic } from "@tabler/icons-react";
import { atom, useAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from 'posthog-js/react'

const loadingAtom = atom(false);

export default function WatchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useAtom(loadingAtom);
  const [song, setSong] = useAtom(songAtom);
  const posthog = usePostHog();

  useShallowEffect(() => {
    posthog.capture('watch_page');
    if (song) {
      return;
    }

    if (!searchParams.get("v")) {
      notifications.show({
        title: "Error",
        message: "Invalid YouTube ID",
      });
      router.push("/");
      return;
    }

    // check if it's a youtube url
    const url = "https://youtube.com/watch?v=" + searchParams.get("v");
    if (!isYoutubeURL(url)) {
      notifications.show({
        title: "Error",
        message: "Invalid YouTube URL",
      });
      router.push("/");
      return;
    }

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
          const body = await res.json();
          console.error(body);
          notifications.show({
            title: "Download error",
            message: body.message ?? "Error when fetching data from YouTube",
          });
          router.push("/");
          return;
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
        });
      })
      .catch((e) => {
        console.error(e);
        notifications.show({
          title: "Download error",
          message: "Error when fetching data from YouTube",
        });
        router.push("/");
        return;
      });
  }, []);

  return (
    <>
      <LoadingOverlay
        visible={loading}
        message="Downloading music, please wait..."
      />
      {song && (
        <Container size="xs">
          <Flex
            h="100dvh"
            align="stretch"
            justify="center"
            gap="md"
            direction="column"
          >
            <Text>Download Completed</Text>
            <Flex gap="md" align="center">
              <Image
                src={song.metadata.coverUrl}
                radius="sm"
                height={48}
                width={48}
                withPlaceholder
                placeholder={
                  <Center>
                    <IconMusic />
                  </Center>
                }
                alt="cover image"
              />
              <Flex direction="column">
                <Text weight={600}>{`${song.metadata.title}`}</Text>
                <Text>{`${song.metadata.author}`}</Text>
              </Flex>
            </Flex>
            <Button
              onClick={() => {
                router.replace("/player");
              }}
            >
              Go to Player
            </Button>
          </Flex>
        </Container>
      )}
    </>
  );
}
