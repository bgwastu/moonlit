/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/shorts/:id",
        destination: "/player?url=https://www.youtube.com/shorts/:id",
      },
      {
        source: "/watch",
        has: [
          {
            type: "query",
            key: "v",
            value: "(?<videoId>.*)",
          },
        ],
        destination: "/player?url=https://www.youtube.com/watch?v=:videoId",
      },
      {
        source: "/@:creator/video/:videoId",
        destination:
          "/player?url=https://www.tiktok.com/@:creator/video/:videoId",
      },
      {
        source: "/ev/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ev/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
  output: "standalone",
};

module.exports = nextConfig;
