import { useShallowEffect } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { atom, useAtom } from "jotai";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LoadingOverlay from "../components/LoadingOverlay";
import { songAtom } from "../state";
import { isYoutubeURL } from "../utils";

function useQuery() {
  const { search } = useLocation();

  return useMemo(() => new URLSearchParams(search), [search]);
}

const loadingAtom = atom(false);

export default function WatchPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useAtom(loadingAtom);
  const [, setSong] = useAtom(songAtom);
  const query = useQuery();

  useShallowEffect(() => {
    if (!query.get("v")) {
      notifications.show({
        title: "Error",
        message: "Invalid YouTube ID",
      });
      navigate("/");
      return;
    }

    // check if it's a youtube url
    const url = "https://youtube.com/watch?v=" + query.get("v");
    if (!isYoutubeURL(url)) {
      notifications.show({
        title: "Error",
        message: "Invalid YouTube URL",
      });
      navigate("/");
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
          navigate("/");
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
          navigate("/player", { replace: true });
        });
      })
      .catch((e) => {
        console.error(e);
        notifications.show({
          title: "Download error",
          message: "Error when fetching data from YouTube",
        });
        navigate("/");
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
