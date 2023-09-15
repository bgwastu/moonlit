"use client";
export const dynamic = "force-dynamic";

import LoadingOverlay from "@/components/LoadingOverlay";
import { songAtom } from "@/state";
import { isYoutubeURL } from "@/utils";
import { useShallowEffect } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { atom, useAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";

const loadingAtom = atom(false);

export default function WatchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useAtom(loadingAtom);
  const [, setSong] = useAtom(songAtom);

  useShallowEffect(() => {
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
          router.replace("/player");
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
    </>
  );
}
