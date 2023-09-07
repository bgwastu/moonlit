import { Button, Flex, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { loadingAtom, songAtom } from "../state";

function isYoutubeURL(url: string) {
  const youtubeRegex =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  return youtubeRegex.test(url);
}

export default function YoutubeUpload() {
  const [loading, setLoading] = useAtom(loadingAtom);
  const [_, setSong] = useAtom(songAtom);
  const form = useForm({
    initialValues: {
      url: "",
    },
    validate: {
      url: (value) =>
        !isYoutubeURL(value) ? "Must be YouTube or YouTube Music URL" : null,
    },
  });

  function fetchMusic(url: string) {
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
            title: res.headers.get("x-yt-title") ?? "Unknown",
            author: res.headers.get("x-yt-author") ?? "Unknown",
            coverUrl: res.headers.get("x-yt-thumb") ?? "",
          },
        });
      })
      .catch((e) => {
        console.error(e);
        notifications.show({
          title: "Download error",
          message: "Error when fetching data from YouTube",
        });
      });
  }

  return (
    <form onSubmit={form.onSubmit((values) => fetchMusic(values.url))}>
      <Flex direction="column" gap="md">
        <TextInput
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="M12.244 4c.534.003 1.87.016 3.29.073l.504.022c1.429.067 2.857.183 3.566.38c.945.266 1.687 1.04 1.938 2.022c.4 1.56.45 4.602.456 5.339l.001.152v.174c-.007.737-.057 3.78-.457 5.339c-.254.985-.997 1.76-1.938 2.022c-.709.197-2.137.313-3.566.38l-.504.023c-1.42.056-2.756.07-3.29.072l-.235.001h-.255c-1.13-.007-5.856-.058-7.36-.476c-.944-.266-1.687-1.04-1.938-2.022c-.4-1.56-.45-4.602-.456-5.339v-.326c.006-.737.056-3.78.456-5.339c.254-.985.997-1.76 1.939-2.021c1.503-.419 6.23-.47 7.36-.476h.489ZM9.999 8.5v7l6-3.5l-6-3.5Z"
              />
            </svg>
          }
          placeholder="YouTube URL"
          size="lg"
          type="url"
          disabled={loading}
          {...form.getInputProps("url")}
        />
        <Button size="lg" type="submit" disabled={loading}>
          Load music from YouTube
        </Button>
      </Flex>
    </form>
  );
}
