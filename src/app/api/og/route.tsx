import { ImageResponse } from "next/og";

export const runtime = "edge";

export default async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "Moonlit";
  const coverUrl = searchParams.get("cover");

  // We use simple fetch here to avoid webpack analysis issues with new URL()
  // We use simple fetch here to avoid webpack analysis issues with new URL()
  const interBold = await fetch(
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-700-normal.woff",
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    <div
      style={{
        background: "#1A1B1E",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"Inter"',
        position: "relative",
      }}
    >
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt="background"
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.15,
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 20,
          zIndex: 10,
        }}
      >
        {/* Logo Container */}
        <div
          style={{
            backgroundColor: "#5f3dc4", // violet[9]
            color: "#e5dbff", // violet[0]
            padding: 16,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            marginRight: 24,
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 16 16"
          >
            <g fill="currentColor">
              <path d="M6 .278a.768.768 0 0 1 .08.858a7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277c.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316a.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71C0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
              <path d="M10.794 3.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387a1.734 1.734 0 0 0-1.097 1.097l-.387 1.162a.217.217 0 0 1-.412 0l-.387-1.162A1.734 1.734 0 0 0 9.31 6.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387a1.734 1.734 0 0 0 1.097-1.097l.387-1.162zM13.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.156 1.156 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.156 1.156 0 0 0-.732-.732l-.774-.258a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732L13.863.1z" />
            </g>
          </svg>
        </div>

        <div
          style={{
            color: "#FFFFFF",
            fontSize: 70,
            fontWeight: 600,
            margin: 0,
            letterSpacing: "-0.04em",
          }}
        >
          Moonlit
        </div>
      </div>

      <div
        style={{
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 60px",
          textAlign: "center",
          maxWidth: 1000,
        }}
      >
        {/* Show dynamic song title if it is not just 'Moonlit' */}
        {title !== "Moonlit" && (
          <p
            style={{
              fontSize: 48,
              fontWeight: 600,
              color: "#FFFFFF",
              margin: "0 0 15px 0",
              lineHeight: 1.2,
              textShadow: "0 4px 10px rgba(0,0,0,0.5)",
              letterSpacing: "-0.02em",
            }}
          >
            {title.length > 80 ? title.substring(0, 80) + "..." : title}
          </p>
        )}

        <p
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "#8A8D91",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          Slowed & Nightcore Music Player
        </p>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: interBold,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
