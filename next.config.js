/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/phog/:path*",
        destination: "https://app.posthog.com/:path*",
      },
    ];
  },
}

module.exports = nextConfig
