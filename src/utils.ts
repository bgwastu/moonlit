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

export function getDominantColorFromImage(img: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;

  const colorCounts = new Map();

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 0) {
      continue;
    }

    const rgb = `${data[i]}, ${data[i + 1]}, ${data[i + 2]}`;

    if (colorCounts.has(rgb)) {
      colorCounts.set(rgb, colorCounts.get(rgb) + 1);
    } else {
      colorCounts.set(rgb, 1);
    }
  }

  let maxCount = 0;
  let dominantColor = "";

  colorCounts.forEach((count, color) => {
    if (count > maxCount) {
      maxCount = count;
      dominantColor = color;
    }
  });

  return `rgb(${dominantColor})`;
}