const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/videos";

/** Fetch video details from YouTube Data API */
export async function fetchYoutubeDetails(id: string) {
  const response = await fetch(
    `${YOUTUBE_API_URL}?id=${id}&part=snippet,contentDetails&key=${YOUTUBE_API_KEY}`,
  );

  if (!response.ok) throw new Error("Failed to fetch video details");

  const data = await response.json();
  if (!data.items?.length) throw new Error("Video not found");

  return { ...data.items[0].snippet, ...data.items[0].contentDetails };
}
