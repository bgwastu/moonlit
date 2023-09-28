export const getSongLength = (bufferDuration: number, playbackRate: number) => {
  return bufferDuration / playbackRate;
};

export function isYoutubeURL(url: string) {
  const youtubeRegex =
    /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  return youtubeRegex.test(url);
}

export function getYouTubeId(url: string) {
  const youtubeRegex =
    /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  return youtubeRegex.exec(url)?.[5];
}

export function isJSONString(str: string) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

export function getFormattedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  const formattedMinutes = String(minutes).padStart(2, "");
  const formattedSeconds = String(remainingSeconds).padStart(2, "0");

  return `${formattedMinutes}:${formattedSeconds}`;
}

export function getDominantColorFromImage(img: HTMLImageElement, palenessFactor: number = 0.8) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 0) {
      continue;
    }
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  
  r = Math.floor((r / count) * palenessFactor);
  g = Math.floor((g / count) * palenessFactor);
  b = Math.floor((b / count) * palenessFactor);
  
  return `rgb(${r}, ${g}, ${b})`;
}
