# Moonlit

Are you a weirdo who likes to listen to _slowed_, _nightcore_ music? Well, you'll probably like this app.

The app is available at [moonlit.wastu.net](https://moonlit.wastu.net).

For quick access, you can replace the URL with the Moonlit URL:

- **YouTube**: Replace `youtube.com` with `moonlit.wastu.net` to the URL (example: <a href="https://moonlit.wastu.net/watch?v=JGwWNGJdvx8" target="_blank">moonlit.wastu.net/watch?v=JGwWNGJdvx8</a>)

https://github.com/user-attachments/assets/64777ba1-6022-42b5-a653-c73bd4a61013

# Features

- **Pitch Lock & Shifting**: Change the speed without affecting pitch, or shift pitch independently (non lite mode).
- **Reverb Effect**: Add ambiance to your tracks with adjustable reverb.
- **Search Support**: Search for videos on YouTube for faster access.
- **Lyrics Support**: View synchronized, syllable-level lyrics while listening to your tracks.
- **Client-Side Cookie Management**: Use your own YouTube cookies to bypass restrictions (e.g., age-gated content).
- **Export Options**: Download the original media or export your processed remix as a WAV or MP3 file.
- **Self-Hostable**: Run with a single Docker container or directly on your host.

# Quick start

## Docker

```bash
docker pull ghcr.io/bgwastu/moonlit:latest

docker run -d \
  --name moonlit \
  -p 3000:3000 \
  -v moonlit-data:/app/data \
  ghcr.io/bgwastu/moonlit:latest
```

Open [http://localhost:3000](http://localhost:3000).

Optional environment variables:

| Variable         | Description                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| `ADMIN_PASSWORD` | Enables the admin cookie management page at `/admin`                   |
| `PROXY_URL`      | Proxy for all outbound requests (`http://`, `socks5://`, `socks5h://`) |

```bash
docker run -d \
  --name moonlit \
  -p 3000:3000 \
  -e ADMIN_PASSWORD=your_password \
  -e PROXY_URL=socks5://127.0.0.1:1080 \
  -v moonlit-data:/app/data \
  ghcr.io/bgwastu/moonlit:latest
```

### Build from source

```bash
docker build -t moonlit .
docker run -d \
  --name moonlit \
  -p 3000:3000 \
  -v moonlit-data:/app/data \
  moonlit
```

## Native host (no Docker)

Prerequisites: Bun, Node.js 24+, Python 3, ffmpeg.

```bash
bun install
bun run build
NODE_ENV=production bun run start
```

# Credits

- **Signalsmith Stretch**: A massive shoutout to [Signalsmith Audio](https://signalsmith-audio.co.uk/) for their open-source time-stretching library. Honestly, I'm too dumb to implement complex DSP algorithms like this by myself, so this library is doing all the heavy lifting! 😅
- **Better Lyrics**: Thanks to [Better Lyrics](https://better-lyrics.boidu.dev) and the [Better Lyrics API](https://lyrics-api.boidu.dev/) for syllable-synced lyrics and TTML timing data.
- **LRCLIB**: Thanks to [lrclib.net](https://lrclib.net/) for providing additional lyrics when Better Lyrics has no match.

# Donating

If you like this project, please consider [donating](https://www.buymeacoffee.com/moonlitapp). Your support helps me pay for domain and hosting services. Thanks!
