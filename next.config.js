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
    ];
  },
  skipTrailingSlashRedirect: true,
  output: "standalone",
};

module.exports = nextConfig;
