"use client";

import { Player } from "@/components/Player";
import LoadingOverlay from "@/components/LoadingOverlay";
import { Song } from "@/interfaces";
import { isTikTokURL } from "@/utils";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";

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
    const cleanCreator = decodedCreator.startsWith("@") ? decodedCreator.slice(1) : decodedCreator;
    const url = `https://www.tiktok.com/@${cleanCreator}/video/${videoId}`;
    console.log(url)

    if (!isTikTokURL(url)) {
      router.push("/");
      return;
    }

    const loadTikTokVideo = async () => {
      try {
        setLoading(true);

        // Fetch video data
        const response = await fetch("/api/tiktok", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, videoMode: true }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to load TikTok video");
        }

        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);

        const title = decodeURIComponent(
          response.headers.get("Title") || "Unknown Title"
        );
        const author = decodeURIComponent(
          response.headers.get("Author") || creator
        );
        const thumbnail = decodeURIComponent(
          response.headers.get("Thumbnail") || ""
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

        setSong(songData);
      } catch (error) {
        console.error("Failed to load TikTok video:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load video"
        );
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
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h2>Error Loading Video</h2>
        <p>{error}</p>
        <button onClick={() => router.push("/")}>Go Home</button>
      </div>
    );
  }

  if (!song) {
    router.push("/");
    return null;
  }

  return <Player song={song} repeating={true} />;
}
