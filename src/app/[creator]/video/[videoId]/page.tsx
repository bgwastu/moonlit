"use client";

import { Player } from "@/components/Player";
import LoadingOverlay from "@/components/LoadingOverlay";
import type { Song } from "@/interfaces";
import { isTikTokURL } from "@/utils";
import { getMedia, setMedia, getMeta, setMeta } from "@/utils/cache";
import { getCookiesToUse } from "@/lib/cookies";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { Button, Container, Flex, Text, Title } from "@mantine/core";

type Props = {
  params: { creator: string; videoId: string };
};

export default function TikTokVideoPage({ params }: Props) {
  const { creator, videoId } = params;
  const router = useRouter();
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Remove @ if it exists at the start of creator since we'll add it back
    // URL decode the creator parameter first to handle encoded @ symbols
    const decodedCreator = decodeURIComponent(creator);
    const cleanCreator = decodedCreator.startsWith("@")
      ? decodedCreator.slice(1)
      : decodedCreator;
    const url = `https://www.tiktok.com/@${cleanCreator}/video/${videoId}`;
    console.log(url);

    if (!isTikTokURL(url)) {
      router.push("/");
      return;
    }

    const loadTikTokVideo = async () => {
      try {
        setLoading(true);

        const cacheKey = `tt:${videoId}:video`;
        const cached = await getMedia(cacheKey);
        if (cached) {
          const blobUrl = URL.createObjectURL(cached);
          const storedMeta = await getMeta<Partial<Song["metadata"]>>(
            `tt:${videoId}`,
          );
          const songData: Song = {
            fileUrl: blobUrl,
            videoUrl: blobUrl,
            metadata: {
              id: videoId,
              title: storedMeta?.title || "",
              author: storedMeta?.author || decodedCreator,
              coverUrl: storedMeta?.coverUrl || "",
              platform: "tiktok",
            },
          };
          setSong(songData);
          return;
        }

        // Get cookies
        const { cookies } = await getCookiesToUse();

        // Fetch video data
        const response = await fetch("/api/tiktok", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, videoMode: true, cookies }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to load TikTok video");
        }

        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);

        const title = decodeURIComponent(
          response.headers.get("Title") || "Unknown Title",
        );
        const author = decodeURIComponent(
          response.headers.get("Author") || creator,
        );
        const thumbnail = decodeURIComponent(
          response.headers.get("Thumbnail") || "",
        );

        const songData: Song = {
          fileUrl: videoUrl,
          videoUrl: videoUrl,
          metadata: {
            id: videoId,
            title: title,
            author: author,
            coverUrl: thumbnail,
            platform: "tiktok",
          },
        };

        await setMedia(cacheKey, blob);
        await setMeta(`tt:${videoId}`, songData.metadata);
        setSong(songData);
      } catch (error) {
        console.error("Failed to load TikTok video:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to load video";
        setError(errorMessage);
        notifications.show({
          title: "Error",
          message: errorMessage,
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    };

    loadTikTokVideo();
  }, [creator, videoId, router]);

  if (loading) {
    return <LoadingOverlay visible={true} message="Loading TikTok video..." />;
  }

  if (error) {
    return (
      <Container size="sm">
        <Flex
          justify="center"
          align="center"
          h="100vh"
          direction="column"
          gap="md"
          ta="center"
        >
          <Title order={2}>Error Loading Video</Title>
          <Text color="red">{error}</Text>
          <Text>
            We couldn&apos;t process this video. You can try downloading it
            manually and uploading it to Moonlit.
          </Text>
          <Button onClick={() => router.push("/")}>Go Home</Button>
        </Flex>
      </Container>
    );
  }

  if (!song) {
    router.push("/");
    return null;
  }

  return <Player song={song} repeating={true} />;
}
