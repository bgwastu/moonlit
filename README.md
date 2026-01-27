# Moonlit
Are you a weirdo who likes to listen to *slowed* or *nightcore* music? Well, you'll probably like this app.

Moonlit is a music app with customizable playback to accompany your moods. It works by using playback rate adjustment and the Web Audio API (for reverb) to manipulate the audio in real-time.

See it in action: [moonlit.wastu.net](https://moonlit.wastu.net)

You can listen to your favorite tracks from multiple platforms on Moonlit:
- **YouTube**: Replace `youtube.com` with `moonlit.wastu.net` to the URL (example: [moonlit.wastu.net/watch?v=dQw4w9WgXcQ](https://moonlit.wastu.net/watch?v=dQw4w9WgXcQ))
- **TikTok**: Replace `tiktok.com` with `moonlit.wastu.net` to the URL (example: [moonlit.wastu.net/@etherealbia/video/7482838437075094790](https://moonlit.wastu.net/@etherealbia/video/7482838437075094790)

### Browser Extension / Userscript 🧩
Want a smoother experience? Install our **Userscript** to add an "Open in Moonlit" button directly to YouTube and TikTok!

[![Install Userscript](https://img.shields.io/badge/Install-Userscript-5F3DC4?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://moonlit.wastu.net/moonlit-opener.user.js)

1. Install [Tampermonkey](https://www.tampermonkey.net/) extension.
2. Click the button above to install the script.


# Demo 🔊
https://github.com/bgwastu/moonlit/assets/67826350/a60fa36b-528a-4216-a925-971055a9ff42


# Features
- **Customizable playback settings**: Change the playback speed and reverb to create slowed or nightcore effects!
- **Multi-platform support**: Works with YouTube and TikTok.
- **Client-Side Cookie Management**: Use your own YouTube cookies to bypass restrictions (e.g., age-gated content). Cookies are stored securely in your browser and are only temporarily used during video fetching.
- **Video Quality Selection**: Choose between high (720p) or low (480p) quality when downloading videos > 10 minutes.
- **Admin Dashboard**: A dedicated interface to manage system-wide cookies and update the yt-dlp binary to the latest version.
- **Real-time audio processing**: Uses playback rate adjustment and Web Audio API (for reverb) for high-quality audio manipulation.
- **Export Options**: Download the original media or export your processed remix as a WAV file.
- **Self-Hostable**: Includes Docker and Docker Compose support for easy deployment.

# Donating
If you like this project, please consider [donating](https://www.buymeacoffee.com/moonlitapp). Your support helps me pay for domain and hosting services. Thanks!
