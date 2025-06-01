import InitialPlayer from "@/components/InitialPlayer";
import { isYoutubeURL } from "@/utils";
import { Metadata } from "next";
import { notFound } from "next/navigation";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/videos";

type Props = {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

async function fetchVideoDetails(id: string) {
  const response = await fetch(
    `${YOUTUBE_API_URL}?id=${id}&part=snippet&key=${YOUTUBE_API_KEY}`
  );
  const data = await response.json();
  if (!response.ok || !data.items || data.items.length === 0) {
    throw new Error("Video not found");
  }
  return data.items[0].snippet;
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const id = searchParams.v as string;

  if (!isYoutubeURL("https://youtube.com/watch?v=" + id)) {
    notFound();
  }

  const videoDetails = await fetchVideoDetails(id);
  return {
    title: videoDetails.title + " - Moonlit",
    description: "Play music with Slowed+Reverb & Nightcore effects.",
    twitter: {
      title: videoDetails.title + " - Moonlit",
      description: "Play music with Slowed+Reverb & Nightcore effects.",
    },
    openGraph: {
      images: [
        {
          url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
          width: 1280,
          height: 720,
          alt: "Thumbnail",
        },
      ],
    },
  };
}

export default async function Page({ searchParams }: Props) {
  const id = searchParams.v as string;
  if (!isYoutubeURL("https://youtube.com/watch?v=" + id)) {
    notFound();
  }
  const metadata = await fetchVideoDetails(id);

  return (
    <InitialPlayer
      youtubeId={id as string}
      isShorts={false}
      metadata={{
        title: metadata.title,
        author: metadata.channelTitle,
        coverUrl: metadata.thumbnails.default.url,
      }}
    />
  );
}
