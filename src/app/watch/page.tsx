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
  const title = `${videoDetails.title} - Moonlit`;
  const description = `Listen to "${videoDetails.title}" by ${videoDetails.channelTitle} with customizable slowed and nightcore effects on Moonlit.`;
  const imageUrl = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  const url = `https://moonlit.wastu.net/watch?v=${id}`;

  return {
    title,
    description,
    keywords: ["slowed music", "nightcore", videoDetails.title, videoDetails.channelTitle, "youtube player"],
    authors: [{ name: "Moonlit" }],
    creator: "Moonlit",
    publisher: "Moonlit",
    openGraph: {
      title,
      description,
      url,
      siteName: "Moonlit",
      type: "website",
      locale: "en_US",
      images: [
        {
          url: imageUrl,
          width: 1280,
          height: 720,
          alt: `${videoDetails.title} - ${videoDetails.channelTitle}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@moonlitapp",
      site: "@moonlitapp",
      images: [imageUrl],
    },
    robots: {
      index: true,
      follow: true,
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
