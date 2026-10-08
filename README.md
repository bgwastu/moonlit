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
- **Lyrics Support**: View synchronized, syllable-level lyrics with Japanese and Korean romanization.
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

| Variable                     | Description                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ADMIN_PASSWORD`             | Enables the admin cookie management page at `/admin`                                                         |
| `PROXY_URL`                  | HTTP CONNECT proxy for outbound YouTube requests (`http://` or `https://`)                                   |
| `YOUTUBE_CREDENTIAL_MODE`    | `anonymous` by default; set `system` to explicitly use `/app/data/cookies.txt` with a compatible web session |
| `AUDIO_PROVIDER`             | `sabr` by default; `legacy` selects the previous direct-URL provider for rollback                            |
| `AUDIO_CACHE_BYTES`          | Server audio cache quota in bytes; defaults to 2 GiB                                                         |
| `AUDIO_CACHE_TTL_HOURS`      | Server audio cache lifetime; defaults to 24 hours                                                            |
| `AUDIO_CONCURRENCY`          | Simultaneous audio downloads; defaults to 2                                                                  |
| `AUDIO_MAX_DURATION_SECONDS` | Maximum recording length; defaults to 7200 seconds                                                           |

```bash
docker run -d \
  --name moonlit \
  -p 3000:3000 \
  -e ADMIN_PASSWORD=your_password \
  -e PROXY_URL=http://your-proxy:3128 \
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

Prerequisites: Bun, Node.js 24+, ffmpeg and ffprobe, npm.

```bash
bun install
npm ci --prefix services/audio --omit=dev --ignore-scripts
bun run build
NODE_ENV=production bun run start
```

`bun run dev` and `bun run start` supervise Next.js and the private audio worker together. The worker resolves YouTube's web player, generates playback tokens, downloads SABR audio, and validates the complete recording before serving it. Repeated plays use the server cache or the existing browser cache. Audio remains available to speed, independent pitch, reverb, and MP3 export.

The worker listens on loopback port 3010 and requires a bearer secret generated in `data/.audio-worker-secret`. Keep the data volume to retain the cache and secrets across restarts. Run one worker per data directory. Do not publish its port to the internet. To run it separately, configure `AUDIO_WORKER_URL` and the same `AUDIO_WORKER_SECRET` on both processes; the app then starts only Next.js. The separate worker supports `AUDIO_WORKER_HOST`, `AUDIO_WORKER_PORT`, and `MOONLIT_DATA_DIR`.

Anonymous playback is the default. On connections where YouTube requires account access, set `YOUTUBE_CREDENTIAL_MODE=system` after exporting account cookies to `data/cookies.txt`, or enable personal cookies in the app. Account sessions and caches are isolated by credential scope, and cookies are never written into the job database. Automatic playback tokens reduce manual maintenance, but YouTube can still restrict an account, connection, or recording.

The status chip reports Online only after fresh search and complete audio delivery both succeed. Playback failures show Degraded even when search still works. Untested or expired evidence shows Unverified. Known private, removed, age-gated, and region-restricted recordings are reported separately.

Run `bun run test:audio` for the media service checks.

# Credits

- **Signalsmith Stretch**: A massive shoutout to [Signalsmith Audio](https://signalsmith-audio.co.uk/) for their open-source time-stretching library. Honestly, I'm too dumb to implement complex DSP algorithms like this by myself, so this library is doing all the heavy lifting! 😅
- **Better Lyrics**: Thanks to [Better Lyrics](https://better-lyrics.boidu.dev) and the [Better Lyrics API](https://lyrics-api.boidu.dev/) for syllable-synced lyrics and TTML timing data.
- **LRCLIB**: Thanks to [lrclib.net](https://lrclib.net/) for providing additional lyrics when Better Lyrics has no match.

# Donating

If you like this project, please consider [donating](https://www.buymeacoffee.com/moonlitapp). Your support helps me pay for domain and hosting services. Thanks!
