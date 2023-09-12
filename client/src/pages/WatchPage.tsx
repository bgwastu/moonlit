import { atom, useAtom } from "jotai";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isYoutubeURL } from "../utils";
import { notifications } from "@mantine/notifications";
import { songAtom } from "../state";
import LoadingOverlay from "../components/LoadingOverlay";
import { useShallowEffect } from "@mantine/hooks";

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
      console.log("asdasd");
      notifications.show({
        title: "Error",
        message: "Invalid YouTube ID",
      });
      navigate("/");
      return;
    }

    // check if it's a youtube url
    const url = "https://youtube.com/watch?v=" + query.get("v");
    console.log(url);
    if (!isYoutubeURL(url)) {
      notifications.show({
        title: "Error",
        message: "Invalid YouTube URL",
      });
      navigate("/");
      return;
    }

    setLoading(true);
    fetch(import.meta.env.VITE_API_URL + "/yt", {
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
          console.error("Error when fetching data from YouTube");
          console.error(res);
          notifications.show({
            title: "Download error",
            message: "Error when fetching data from Youtube",
          });
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
          navigate("/player");
        });
      })
      .catch((e) => {
        console.error(e);
        notifications.show({
          title: "Download error",
          message: "Error when fetching data from YouTube",
        });
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
