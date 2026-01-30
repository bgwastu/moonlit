# Moonlit

Are you a weirdo who likes to listen to _slowed_ or _nightcore_ music? Well, you'll probably like this app.

Moonlit is a music app with customizable playback to accompany your moods. It works by using playback rate adjustment and the Web Audio API (for reverb) to manipulate the audio in real-time.

See it in action: [moonlit.wastu.net](https://moonlit.wastu.net)

You can listen to your favorite tracks from multiple platforms on Moonlit:

- **YouTube**: Replace `youtube.com` with `moonlit.wastu.net` to the URL (example: <a href="https://moonlit.wastu.net/watch?v=AEp08vVYreg" target="_blank">moonlit.wastu.net/watch?v=AEp08vVYreg</a>)
- **TikTok**: Replace `tiktok.com` with `moonlit.wastu.net` to the URL (example: <a href="https://moonlit.wastu.net/@etherealbia/video/7482838437075094790" target="_blank">moonlit.wastu.net/@etherealbia/video/7482838437075094790</a>)

### Browser Extension / Userscript 🧩

Want a smoother experience? Install our **Userscript** to add an "Open in Moonlit" button directly to YouTube and TikTok!

[![Install Userscript](https://img.shields.io/badge/Install-Userscript-5F3DC4?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://moonlit.wastu.net/moonlit-opener.user.js)

1. Install [Tampermonkey](https://www.tampermonkey.net/) extension.
2. Click the button above to install the script.

# Demo 🔊

https://github.com/bgwastu/moonlit/assets/67826350/a60fa36b-528a-4216-a925-971055a9ff42

# Features

- **Customizable Playback**: Change playback speed, enabling "slowed & reverb" or "nightcore" effects.
- **Pitch Lock & Shifting**: Change the speed without affecting pitch, or shift pitch independently (semitones).
- **Reverb Effect**: Add ambiance to your tracks with adjustable reverb.
- **Multi-platform support**: Works with YouTube and TikTok.
- **Client-Side Cookie Management**: Use your own YouTube cookies to bypass restrictions (e.g., age-gated content).
- **Video Quality Selection**: Choose between high (720p) or low (480p) quality when downloading videos > 10 minutes.
- **Admin Dashboard**: A dedicated interface to manage system-wide cookies and update the yt-dlp binary.
- **Export Options**: Download the original media or export your processed remix as a WAV file.
- **Self-Hostable**: Includes Docker and Docker Compose support for easy deployment.

# How it Works 🛠️

Moonlit leverages the **Web Audio API** to process audio real-time in the browser.

- **Time & Pitch Manipulation**: We use the incredible [signalsmith-stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch-js) library to handle time-stretching and pitch-shifting with high quality and minimal artifacts.
- **Reverb**: Implemented using a Convolution Reverb with a generated impulse response.
- **Syncing**: The processed audio is played through an AudioContext while keeping the video element (muted) synchronized for visuals.

# Credits 🌟

- **Signalsmith Stretch**: A massive shoutout to [Signalsmith Audio](https://signalsmith-audio.co.uk/) for their open-source time-stretching library. Honestly, I'm too dumb to implement complex DSP algorithms like this by myself, so this library is doing all the heavy lifting! 😅

# Donating

If you like this project, please consider [donating](https://www.buymeacoffee.com/moonlitapp). Your support helps me pay for domain and hosting services. Thanks!
