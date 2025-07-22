"use client";

import { Player } from "@/components/Player";
import { TikTokPlayer } from "@/components/TikTokPlayer";
import { songAtom } from "@/state";
import { isTikTokURL, isInstagramURL } from "@/utils";
import { useAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
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
  
  // Keep track of current blob URLs for cleanup
  const currentBlobUrls = useRef<string[]>([]);
  const currentUrl = useRef<string | null>(null);

  // Cleanup function for blob URLs
  const cleanupBlobUrls = () => {
    currentBlobUrls.current.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn('Failed to revoke blob URL:', e);
      }
    });
    currentBlobUrls.current = [];
  };

  useEffect(() => {
    const url = searchParams.get("url");
    const title = searchParams.get("title");
    const author = searchParams.get("author");
    const thumbnail = searchParams.get("thumbnail");

    // If URL changed, cleanup previous song and reset state
    if (currentUrl.current !== url) {
      console.log('URL changed, cleaning up previous song');
      
      // Cleanup previous blob URLs
      cleanupBlobUrls();
      
      // Clear song state when URL changes
      if (song) {
        setSong(null);
      }
      
      // Reset states
      setProcessed(false);
      setIsPlayer(false);
      setLoading(false);
      
      currentUrl.current = url;
    }

    if (url && (isTikTokURL(decodeURIComponent(url)) || isInstagramURL(decodeURIComponent(url))) && !processed && !song) {
      // Handle TikTok or Instagram URL from parameters
      setLoading(true);
      setProcessed(true);
      
      const loadSong = async () => {
        try {
          const decodedUrl = decodeURIComponent(url);
          const isTikTokUrl = isTikTokURL(decodedUrl);
          const apiEndpoint = isTikTokUrl ? "/api/tiktok" : "/api/instagram";
          const platform = isTikTokUrl ? "TikTok" : "Instagram";
          
          if (isTikTokUrl) {
            // For TikTok, request video buffer (like audio)
            const response = await fetch(apiEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: decodedUrl, videoMode: true }),
            });

            if (!response.ok) {
              throw new Error(`Failed to load ${platform} video`);
            }

            const blob = await response.blob();
            const videoUrl = URL.createObjectURL(blob);
            
            // Track blob URL for cleanup
            currentBlobUrls.current.push(videoUrl);
            
            const metadata = {
              id: null,
              title: decodeURIComponent(response.headers.get("Title") || title || "Unknown Title"),
              author: decodeURIComponent(response.headers.get("Author") || author || "Unknown Artist"),
              coverUrl: decodeURIComponent(response.headers.get("Thumbnail") || thumbnail || "") || undefined,
              platform: "tiktok" as const,
            };

            setSong({
              fileUrl: videoUrl,
              videoUrl: videoUrl,
              metadata,
            });
          } else {
            // For Instagram, use original audio-only approach
            const response = await fetch(apiEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: decodedUrl }),
            });

            if (!response.ok) {
              throw new Error(`Failed to load ${platform} audio`);
            }

            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            
            // Track blob URL for cleanup
            currentBlobUrls.current.push(audioUrl);
            
            const metadata = {
              id: null,
              title: decodeURIComponent(title || "Unknown Title"),
              author: decodeURIComponent(author || "Unknown Artist"),
              coverUrl: decodeURIComponent(thumbnail || "") || undefined,
            };

            setSong({
              fileUrl: audioUrl,
              metadata,
            });
          }
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

  // Cleanup blob URLs when component unmounts or URL changes
  useEffect(() => {
    return () => {
      cleanupBlobUrls();
    };
  }, []);

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
    
    // Use TikTokPlayer for TikTok content with video
    if (isTikTok && song.videoUrl) {
      return <TikTokPlayer song={song} repeating={true} />;
    }
    
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
          Video Details
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
            <Text>Downloading the video...</Text>
          </Flex>
        ) : (
          <Button onClick={handleGoToPlayer}>Play</Button>
        )}
      </Flex>
    </Container>
  );
}
