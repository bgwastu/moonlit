import ytdl from '@distube/ytdl-core';

// Create a reusable agent with cookies
const agent = ytdl.createAgent(
  process.env.YOUTUBE_COOKIES ? JSON.parse(process.env.YOUTUBE_COOKIES) : undefined
);

export const getVideoInfo = async (url: string) => {
  "use server";

  const info = await ytdl.getInfo(url, { agent });
  return {
    title: info.videoDetails.title,
    author: info.videoDetails.author.name,
    thumbnail: info.videoDetails.thumbnails[0].url,
    lengthSeconds: parseInt(info.videoDetails.lengthSeconds)
  };
};

export const getAudioStream = async (url: string) => {
  "use server";
  
  // Get only audio format with highest quality
  const info = await ytdl.getInfo(url, { agent });
  const format = ytdl.chooseFormat(info.formats, {
    quality: 'highestaudio',
    filter: 'audioonly'
  });

  return ytdl(url, { 
    format,
    agent
  });
};
