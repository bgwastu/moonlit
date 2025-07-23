"use client";

import useNoSleep from "@/hooks/useNoSleep";
import { Song } from "@/interfaces";
import { songAtom } from "@/state";
import { getYouTubeId, isSupportedURL } from "@/utils";
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
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import Icon from "./Icon";
import { Player } from "./Player";

interface InitialPlayerProps {
  youtubeId: string;
  isShorts: boolean;
  metadata: Partial<Song["metadata"]>;
}

async function getSongFromYouTubeInternal(url: string): Promise<Song> {
  const response = await fetch("/api/yt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Failed to load YouTube content");
  }

  const title = decodeURIComponent(response.headers.get("Title") || "Unknown Title");
  const author = decodeURIComponent(response.headers.get("Author") || "Unknown Artist");
  const thumbnail = decodeURIComponent(response.headers.get("Thumbnail") || "");
  const videoMode = response.headers.get("VideoMode") === "true";
  const videoUrl = response.headers.get("VideoUrl");

  const metadata = {
    id: getYouTubeId(url),
    title: title,
    author: author,
    coverUrl: thumbnail,
    platform: "youtube" as const,
  };

  if (videoMode && videoUrl) {
    // Short video with direct URL
    return {
      fileUrl: decodeURIComponent(videoUrl),
      videoUrl: decodeURIComponent(videoUrl),
      metadata,
    };
  } else if (videoMode) {
    // Short video with blob
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    return {
      fileUrl: blobUrl,
      videoUrl: blobUrl,
      metadata,
    };
  } else {
    // Audio-only for longer videos
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    return {
      fileUrl: audioUrl,
      metadata,
    };
  }
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

    if (!isSupportedURL(url)) {
      notifications.show({
        title: "Error",
        message: "Invalid URL generated.",
      });
      router.push("/");
      return;
    }

    (setSong as (song: Song | null) => void)(null);
    setIsPlayer(false);

    getSongFromYouTubeInternal(url)
      .then((downloadedSong: Song) => {
        (setSong as (song: Song | null) => void)(downloadedSong);
      })
      .catch((e) => {
        console.error(`${pageType}: Download error:`, e);
        notifications.show({
          title: "Download error",
          message: e.message || "Could not process the video.",
        });
        router.push("/");
      });
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
          Video Details
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
            <Text weight={600}>{metadata.title || "Loading..."}</Text>
            <Text>{metadata.author || "Loading..."}</Text>
          </Flex>
        </Flex>
        {isLoading ? (
          <Flex gap="md" align="center">
            <Loader size="sm" />
            <Text>Downloading the video...</Text>
          </Flex>
        ) : (
          <Button onClick={handleGoToPlayer}>Play</Button>
        )}
      </Flex>
    </Container>
  );
}
