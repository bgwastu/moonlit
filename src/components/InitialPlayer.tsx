"use client";

import useNoSleep from "@/hooks/useNoSleep";
import { Song } from "@/interfaces";
import { songAtom } from "@/state"; // This might be removed if song state is fully internal
import { getYouTubeId, isYoutubeURL } from "@/utils";
import {
  Button,
  Center,
  Container,
  Flex,
  Image,
  Loader,
  Text,
  rem
} from "@mantine/core";
import { useShallowEffect } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconMusic } from "@tabler/icons-react";
import { atom, useAtom } from "jotai"; // Keep for global state if needed, or remove if local
import localforage from "localforage";
import { useRouter } from "next/navigation"; // For potential redirects on error
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import Icon from "./Icon";
import { Player } from "./Player";

interface InitialPlayerProps {
  youtubeId: string;
  isShorts: boolean;
  metadata: Partial<Song["metadata"]>;
}

export default function InitialPlayer({
  youtubeId,
  isShorts,
  metadata,
}: InitialPlayerProps) {
  const router = useRouter();
  const posthog = usePostHog();

  const [song, setSong] = useAtom(songAtom);
  const [isPlayer, setIsPlayer] = useState(false);
  const [noSleepEnabled, setNoSleepEnabled] = useNoSleep();

  const isLoading = !song;

  useShallowEffect(() => {
    if (!youtubeId) {
      notifications.show({
        title: "Error",
        message: "No YouTube ID provided.",
      });
      router.push("/");
      return;
    }

    const pageType = isShorts ? "shorts_page" : "watch_page";
    posthog.capture(pageType, { youtubeId });

    const url = isShorts
      ? `https://youtube.com/shorts/${youtubeId}`
      : `https://youtube.com/watch?v=${youtubeId}`;

    if (!isYoutubeURL(url)) {
      notifications.show({
        title: "Error",
        message: "Invalid YouTube URL generated.",
      });
      router.push("/");
      return;
    }

    setSong(null);
    setIsPlayer(false);

    getSongFromYouTubeInternal(url)
      .then((downloadedSong) => {
        setSong(downloadedSong);
      })
      .catch((e) => {
        console.error(`${pageType}: Download error:`, e);
        notifications.show({
          title: "Download error",
          message: e.message || "Could not process the video.",
        });
        router.push("/");
      })
  }, [youtubeId, isShorts, router, posthog, setSong]);

  const handleGoToPlayer = () => {
    setIsPlayer(true);
    if (!noSleepEnabled) {
      setNoSleepEnabled(true);
    }
  };

  if (isPlayer && song) {
    return <Player song={song} repeating={isShorts} />;
  }

  return (
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
            src={metadata.coverUrl}
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
            <Text weight={600}>{`${metadata.title}`}</Text>
            <Text>{`${metadata.author}`}</Text>
          </Flex>
        </Flex>
        {isLoading ? (
          <Flex gap="md" align="center">
            <Loader size="sm" />
            <Text>Downloading the song...</Text>
          </Flex>
        ) : (
          <Button onClick={handleGoToPlayer}>Play</Button>
        )}
      </Flex>
    </Container>
  );
}

async function getSongFromYouTubeInternal(url: string): Promise<Song> {
  const id = getYouTubeId(url);
  if (!id) throw new Error("Could not extract YouTube ID from URL: " + url);

  const cachedMusic = (await localforage.getItem(id)) as {
    blob: Blob;
    metadata: Song["metadata"];
  };
  if (cachedMusic) {
    return {
      fileUrl: URL.createObjectURL(cachedMusic.blob),
      metadata: cachedMusic.metadata,
    };
  }

  const response = await fetch("/api/yt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }), // Full download request
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ message: `Error downloading: ${response.statusText}` }));
    throw new Error(
      body.message || `Error downloading YouTube music (${response.statusText})`
    );
  }

  const blob = await response.blob();
  const metadata: Song["metadata"] = {
    id,
    title: decodeURI(response.headers.get("Title") || "Unknown Title"),
    author: decodeURI(response.headers.get("Author") || "Unknown Artist"),
    coverUrl: decodeURI(response.headers.get("Thumbnail") || "") || undefined,
  };

  await localforage.setItem(id, { blob, metadata });

  return {
    fileUrl: URL.createObjectURL(blob),
    metadata,
  };
}
