"use client";

import Icon from "@/components/Icon";
import LoadingOverlay from "@/components/LoadingOverlay";
import { Player } from "@/components/Player";
import useNoSleep from "@/hooks/useNoSleep";
import { Song } from "@/interfaces";
import { songAtom } from "@/state";
import { getYouTubeId, isYoutubeURL } from "@/utils";
import {
  Button,
  Center,
  Container,
  Flex,
  Image,
  Text,
  rem,
} from "@mantine/core";
import { useShallowEffect } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconMusic } from "@tabler/icons-react";
import { atom, useAtom } from "jotai";
import localforage from "localforage";
import { usePathname, useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";

const loadingAtom = atom(false);

export default function ShortsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useAtom(loadingAtom);
  const [song, setSong] = useAtom(songAtom);
  const [isPlayer, setIsPlayer] = useState(false);
  const [noSleepEnabled, setNoSleepEnabled] = useNoSleep();
  const posthog = usePostHog();

  useShallowEffect(() => {
    posthog.capture("shorts_page");
    const shortsId = pathname.replace("/shorts/", "");
    const youtubeUrl = `https://youtube.com/shorts/${shortsId}`;

    if (!isYoutubeURL(youtubeUrl)) {
      notifications.show({
        title: "Error",
        message: "Invalid YouTube ID",
      });
      router.push("/");
      return;
    }

    setLoading(true);

    getSongFromYouTube(youtubeUrl)
      .then((song) => {
        setSong(song);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        notifications.show({
          title: "Download error",
          message: e.message,
        });
        setLoading(false);
        router.push("/");
      });
  }, []);

  return (
    <>
      <LoadingOverlay
        visible={loading}
        message="Downloading music, please wait..."
      />
      {song && !isPlayer && !loading && (
        <Container size="xs">
          <Flex
            h="100dvh"
            align="stretch"
            justify="center"
            gap="md"
            direction="column"
          >
            <Flex gap={6} align="center" mb="sm">
              <Icon size={18} />
              <Text
                fz={rem(20)}
                fw="bold"
                lts={rem(0.2)}
                style={{
                  userSelect: "none",
                }}
              >
                Moonlit
              </Text>
            </Flex>
            <Text weight={600} color="dimmed">
              Music Details
            </Text>
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
                setIsPlayer(true);

                if (!noSleepEnabled) {
                  setNoSleepEnabled(true);
                }
              }}
            >
              Go to Player
            </Button>
          </Flex>
        </Container>
      )}
      {isPlayer && <Player song={song} repeating={true} />}
    </>
  );
}

async function getSongFromYouTube(url: string): Promise<Song> {
  if (!isYoutubeURL(url) && !getYouTubeId(url)) {
    throw new Error("Invalid YouTube URL");
  }

  // check cached music
  const id = getYouTubeId(url);
  const cachedMusic = (await localforage.getItem(id)) as any;

  if (cachedMusic) {
    return {
      fileUrl: URL.createObjectURL(cachedMusic.blob),
      metadata: cachedMusic.metadata,
    };
  }

  return fetch("/api/yt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
    }),
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json();
      if (body.message) {
        throw new Error(body.message);
      }
      throw new Error(`Error downloading YouTube music (${res.statusText})`);
    }

    const blob = await res.blob();
    const metadata = {
      id,
      title: decodeURI(res.headers.get("Title")),
      author: decodeURI(res.headers.get("Author")),
      coverUrl: decodeURI(res.headers.get("Thumbnail")),
    };

    // save the music & metadata to the cache localForage
    localforage.setItem(id, { blob, metadata });

    const fileUrl = URL.createObjectURL(blob);
    return { fileUrl, metadata };
  });
}
