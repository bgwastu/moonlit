import { useEffect, useState } from "react";

function getDominantColorFromImage(img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const size = Math.min(img.width, img.height, 128);
  ctx.drawImage(img, 0, 0, size, size);
  if (size === 0) return "";

  try {
    const { data } = ctx.getImageData(0, 0, size, size);
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] <= 0) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (count === 0) return "";
    return `rgb(${Math.floor(r / count)},${Math.floor(g / count)},${Math.floor(b / count)})`;
  } catch {
    return "";
  }
}

export function useDominantColor(imageUrl?: string): string {
  const [dominantColor, setDominantColor] = useState("");

  useEffect(() => {
    if (!imageUrl) return;

    const img = document.createElement("img");
    img.src = imageUrl;
    img.onload = () => setDominantColor(getDominantColorFromImage(img));
    img.onerror = () => setDominantColor("");
  }, [imageUrl]);

  return dominantColor;
}
