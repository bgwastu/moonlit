import { useEffect, useState } from "react";
import { getImageUrlForCanvas } from "@/lib/imageProxy";

/** Extract dominant color from image using canvas pixel sampling */
export function getDominantColorFromImage(
  img: HTMLImageElement,
  palenessFactor: number = 0.8,
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "rgb(0,0,0)";

  ctx.drawImage(img, 0, 0);
  if (img.width === 0 || img.height === 0) return "rgb(0,0,0)";

  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;
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

  if (count === 0) return "rgb(0,0,0)";

  r = Math.floor((r / count) * palenessFactor);
  g = Math.floor((g / count) * palenessFactor);
  b = Math.floor((b / count) * palenessFactor);

  return `rgb(${r}, ${g}, ${b})`;
}

/** Hook to extract and track dominant color from an image URL */
export function useDominantColor(imageUrl?: string, initialColor?: string) {
  const [dominantColor, setDominantColor] = useState<string>(
    initialColor || "rgba(0,0,0,0)",
  );

  useEffect(() => {
    if (initialColor && initialColor !== "rgba(0,0,0,0)") {
      setDominantColor(initialColor);
      return;
    }

    if (!imageUrl) return;

    const img = document.createElement("img");
    img.crossOrigin = "Anonymous";
    img.src = getImageUrlForCanvas(imageUrl || "") || imageUrl || "";

    img.onload = () => {
      const color = getDominantColorFromImage(img);
      setDominantColor(color);
      document.body.style.setProperty("--dominant-color", color);
    };
  }, [imageUrl, initialColor]);

  return dominantColor;
}
