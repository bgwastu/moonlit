import type { CSSProperties } from "react";
import { IconMusic } from "@tabler/icons-react";
import styles from "./CoverFallback.module.css";

type CoverFallbackProps = {
  title?: string;
  artist?: string;
  seed?: string;
  variant?: "artwork" | "thumbnail";
};

export default function CoverFallback({
  title,
  artist,
  seed,
  variant = "thumbnail",
}: CoverFallbackProps) {
  const identity = seed || `${title || ""}|${artist || ""}`;
  const hash = Array.from(identity).reduce(
    (value, char) => (Math.imul(value, 31) + char.codePointAt(0)) >>> 0,
    0,
  );
  const knownTitle = title && title !== "Unknown" ? title : "";
  const knownArtist = artist && artist !== "Unknown" ? artist : "";

  return (
    <div
      className={styles.fallback}
      data-cover-fallback={variant}
      role="img"
      aria-label={knownTitle ? `Artwork placeholder for ${knownTitle}` : "Music artwork"}
      style={{ "--cover-hue": 240 + (hash % 70) } as CSSProperties}
    >
      <div className={styles.disc} aria-hidden>
        <div className={styles.hub}>
          <IconMusic stroke={1.5} />
        </div>
      </div>
      {variant === "artwork" && (
        <div className={styles.details}>
          <span className={styles.eyebrow}>Moonlit</span>
          {knownTitle && <span className={styles.title}>{knownTitle}</span>}
          {knownArtist && <span className={styles.artist}>{knownArtist}</span>}
        </div>
      )}
    </div>
  );
}
