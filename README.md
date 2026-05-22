# Moonlit

Are you a weirdo who likes to listen to _slowed_, _nightcore_ music? Well, you'll probably like this app.

The app is available at [moonlit.wastu.net](https://moonlit.wastu.net).

For quick access, you can replace the URL with the Moonlit URL:

- **YouTube**: Replace `youtube.com` with `moonlit.wastu.net` to the URL (example: <a href="https://moonlit.wastu.net/watch?v=JGwWNGJdvx8" target="_blank">moonlit.wastu.net/watch?v=JGwWNGJdvx8</a>)
- **TikTok**: Replace `tiktok.com` with `moonlit.wastu.net` to the URL (example: <a href="https://moonlit.wastu.net/@etherealbia/video/7482838437075094790" target="_blank">moonlit.wastu.net/@etherealbia/video/7482838437075094790</a>)

https://github.com/user-attachments/assets/a54716fb-35cb-4158-b789-74a74fc359dc

# Features

- **Pitch Lock & Shifting**: Change the speed without affecting pitch, or shift pitch independently (non lite mode).
- **Reverb Effect**: Add ambiance to your tracks with adjustable reverb.
- **Search Support**: Search for videos on YouTube for faster access.
- **Lyrics Support**: View synchronized lyrics while listening to your tracks.
- **Multi-platform support**: Works with YouTube and TikTok.
- **Client-Side Cookie Management**: Use your own YouTube cookies to bypass restrictions (e.g., age-gated content).
- **Export Options**: Download the original media or export your processed remix as a WAV file.
- **Self-Hostable**: Run with a single Docker container or directly on your host.

# Quick start

## Docker

```bash
docker build -t moonlit .
docker run -d \
  --name moonlit \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e YOUTUBE_API_KEY=your_key \
  -e ADMIN_PASSWORD=your_password \
  -v moonlit-data:/app/data \
  moonlit
```

Optional: set `PROXY` if yt-dlp should use an external proxy.

## Native host (no Docker)

Prerequisites:

- Node.js 20+
- Python 3 + pip
- ffmpeg
- yt-dlp + yt-dlp-ejs

Install dependencies and run:

```bash
bun install
bun run build
NODE_ENV=production bun run start
```

If needed, set `PROXY` to route yt-dlp through any external proxy.

# Credits

- **Signalsmith Stretch**: A massive shoutout to [Signalsmith Audio](https://signalsmith-audio.co.uk/) for their open-source time-stretching library. Honestly, I'm too dumb to implement complex DSP algorithms like this by myself, so this library is doing all the heavy lifting! 😅
- **LRCLIB**: Thanks to [lrclib.net](https://lrclib.net/) for providing the lyrics API data.

# Donating

If you like this project, please consider [donating](https://www.buymeacoffee.com/moonlitapp). Your support helps me pay for domain and hosting services. Thanks!
