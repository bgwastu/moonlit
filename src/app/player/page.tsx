"use client";

import { Player } from "@/components/Player";
import { songAtom } from "@/state";
import { isTikTokURL, isInstagramURL } from "@/utils";
import { useAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Center, Container, Flex, Image, Loader, Text, rem } from "@mantine/core";
import { IconMusic } from "@tabler/icons-react";
import Icon from "@/components/Icon";
import useNoSleep from "@/hooks/useNoSleep";

export default function Page() {
  const [song, setSong] = useAtom(songAtom);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [noSleepEnabled, setNoSleepEnabled] = useNoSleep();
  const [isPlayer, setIsPlayer] = useState(false);

  useEffect(() => {
    const url = searchParams.get("url");
    const title = searchParams.get("title");
    const author = searchParams.get("author");
    const thumbnail = searchParams.get("thumbnail");

    if (url && (isTikTokURL(decodeURIComponent(url)) || isInstagramURL(decodeURIComponent(url))) && !processed && !song) {
      // Handle TikTok or Instagram URL from parameters
      setLoading(true);
      setProcessed(true);
      
      const loadSong = async () => {
        try {
          const decodedUrl = decodeURIComponent(url);
          const apiEndpoint = isTikTokURL(decodedUrl) ? "/api/tiktok" : "/api/instagram";
          const platform = isTikTokURL(decodedUrl) ? "TikTok" : "Instagram";
          
          const response = await fetch(apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: decodedUrl }),
          });

          if (!response.ok) {
            throw new Error(`Failed to load ${platform} audio`);
          }

          const blob = await response.blob();
          const metadata = {
            id: null,
            title: decodeURIComponent(title || "Unknown Title"),
            author: decodeURIComponent(author || "Unknown Artist"),
            coverUrl: decodeURIComponent(thumbnail || "") || undefined,
          };

          setSong({
            fileUrl: URL.createObjectURL(blob),
            metadata,
          });
          setLoading(false);
        } catch (error) {
          console.error("Failed to load song:", error);
          setLoading(false);
          router.replace("/");
        }
      };

      loadSong();
    } else if (!url && !song) {
      router.replace("/");
    }
  }, [searchParams, song, router, setSong, processed]);

  const handleGoToPlayer = () => {
    setIsPlayer(true);
    if (!noSleepEnabled) {
      setNoSleepEnabled(true);
    }
  };

  if (isPlayer && song) {
    // Check if it's a TikTok or Instagram URL to enable repeat by default
    const url = searchParams.get("url");
    const isTikTok = url && isTikTokURL(decodeURIComponent(url));
    const isInstagram = url && isInstagramURL(decodeURIComponent(url));
    return <Player song={song} repeating={isTikTok || isInstagram || false} />;
  }

  // Get metadata from URL params for display
  const title = searchParams.get("title");
  const author = searchParams.get("author");
  const thumbnail = searchParams.get("thumbnail");
  const url = searchParams.get("url");
  const isTikTok = url && isTikTokURL(decodeURIComponent(url));
  const isInstagram = url && isInstagramURL(decodeURIComponent(url));

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
          {!isTikTok && !isInstagram && (
            <Image
              src={thumbnail ? decodeURIComponent(thumbnail) : undefined}
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
          )}
          <Flex direction="column">
            <Text weight={600}>{title ? decodeURIComponent(title) : "Unknown Title"}</Text>
            <Text>{author ? decodeURIComponent(author) : "Unknown Artist"}</Text>
          </Flex>
        </Flex>
        {loading || !song ? (
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
