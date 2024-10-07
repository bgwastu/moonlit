import { isYoutubeURL } from "@/utils";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import ShortsPage from "./ShortsPage";

type Props = {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

async function fetchVideoDetails(id: string) {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${id}&part=snippet&key=${process.env.YOUTUBE_API_KEY}`
  );
  const data = await response.json();
  if (!response.ok || !data.items || data.items.length === 0) {
    throw new Error("Video not found");
  }
  return data.items[0].snippet;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = params.id;

  if (!isYoutubeURL("https://youtube.com/shorts/" + id)) {
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
          width: 120,
          height: 90,
          alt: "Thumbnail",
        },
      ],
    },
  };
}

export default function Page({ params }: Props) {
  const id = params.id;
  if (!isYoutubeURL("https://youtube.com/shorts/" + id)) {
    notFound();
  }

  // TODO: pass the url to the page, so it can fetch the song immediately
  return <ShortsPage id={id} />;
}
