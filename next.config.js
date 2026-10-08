/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    const noStore = [{ key: "Cache-Control", value: "no-store" }];
    return [
      { source: "/", headers: noStore },
      { source: "/player", headers: noStore },
      { source: "/watch", headers: noStore },
      { source: "/shorts/:id", headers: noStore },
    ];
  },
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
  serverExternalPackages: ["kuroshiro", "kuroshiro-analyzer-kuromoji", "kuromoji"],
  outputFileTracingIncludes: {
    "/api/lyrics/romanize": ["./node_modules/kuromoji/dict/*.dat.gz"],
  },
};

module.exports = nextConfig;
