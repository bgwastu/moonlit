import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

function parseYtDlpError(stderr: string): string {
  // Parse common yt-dlp errors and provide user-friendly messages
  if (stderr.includes('login required') || stderr.includes('rate-limit reached')) {
    return 'This content is not accessible - it may be private, rate-limited, or require login.';
  }
  if (stderr.includes('HTTP Error 404')) {
    return 'Content not found. The video may have been deleted or the URL is incorrect.';
  }
  if (stderr.includes('HTTP Error 403')) {
    return 'Access forbidden. This content may be private or geo-restricted.';
  }
  if (stderr.includes('unable to extract')) {
    return 'Unable to extract video data. The content may be private or unsupported.';
  }
  if (stderr.includes('Requested content is not available')) {
    return 'This content is not available. It may be private, deleted, or geo-restricted.';
  }
  if (stderr.includes('Video unavailable')) {
    return 'Video is unavailable. It may have been deleted or made private.';
  }
  if (stderr.includes('This video is not available')) {
    return 'This video is not available in your region or has been removed.';
  }

  console.error(stderr);
  
  // Generic fallback
  return 'Failed to process the video. Please check the URL and try again.';
}

interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  lengthSeconds: number;
}

export const getVideoInfo = async (url: string): Promise<VideoInfo> => {
  "use server";
  
  return new Promise((resolve, reject) => {
    const args = [
      '--skip-download',
      '-J',
      '--no-playlist',
      url
    ];

    // Add proxy if available
    if (process.env.PROXY) {
      args.unshift('--proxy', process.env.PROXY);
    }

    const ytdlp = spawn('yt-dlp', args);
    
    let stdout = '';
    let stderr = '';

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code !== 0) {
        const userFriendlyMessage = parseYtDlpError(stderr);
        reject(new Error(userFriendlyMessage));
        return;
      }

      try {
        const info = JSON.parse(stdout);
        resolve({
          title: info.title || '',
          author: info.uploader || info.channel || '',
          thumbnail: info.thumbnail || '',
          lengthSeconds: Math.floor(info.duration || 0)
        });
      } catch (error) {
        reject(new Error('Failed to parse video information. Please try again.'));
      }
    });

    ytdlp.on('error', (error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
    });
  });
};

export const getVideoStream = async (url: string): Promise<Buffer> => {
  "use server";
  
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtemp(path.join(os.tmpdir(), 'moonlit-yt-'));

    tmpDir.then((dir) => {
      const outputTemplate = path.join(dir, '%(id)s.%(ext)s');

      const args = [
        // Prioritize pre-muxed browser-compatible formats, then merge if needed
        '--format', 'best[height<=480][vcodec^=avc][acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=480]',
        '--merge-output-format', 'mp4',
        '--output', outputTemplate,
        '--no-playlist',
        url
      ];

      if (process.env.PROXY) {
        args.unshift('--proxy', process.env.PROXY);
      }

      const ytdlp = spawn('yt-dlp', args);
      
      let stderr = '';

      ytdlp.stdout.on('data', () => {});

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytdlp.on('close', async (code) => {
        try {
          if (code !== 0) {
            const userFriendlyMessage = parseYtDlpError(stderr);
            reject(new Error(userFriendlyMessage));
            return;
          }

          const files = await fs.readdir(dir);
          // Pick the first non-temporary media file
          const mediaFile = files.find((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'));
          if (!mediaFile) {
            reject(new Error('Failed to locate downloaded video file.'));
            return;
          }
          const filePath = path.join(dir, mediaFile);
          const buffer = await fs.readFile(filePath);

          try {
            await Promise.all(files.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})));
            await fs.rmdir(dir).catch(() => {});
          } catch {}

          resolve(buffer);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Unknown error reading video file'));
        }
      });

      ytdlp.on('error', (error) => {
        reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
      });
    }).catch((err) => reject(err instanceof Error ? err : new Error('Failed to create temp dir')));
  });
};

export const getVideoUrl = async (url: string): Promise<string> => {
  "use server";
  
  return new Promise((resolve, reject) => {
    const args = [
      // Prioritize pre-muxed browser-compatible formats, then merge if needed
      '--format', 'best[height<=480][vcodec^=avc][acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=480]',
      '--get-url',
      '--no-playlist',
      url
    ];

    // Add proxy if available
    if (process.env.PROXY) {
      args.unshift('--proxy', process.env.PROXY);
    }

    const ytdlp = spawn('yt-dlp', args);
    
    let stdout = '';
    let stderr = '';

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code !== 0) {
        const userFriendlyMessage = parseYtDlpError(stderr);
        reject(new Error(userFriendlyMessage));
        return;
      }

      const videoUrl = stdout.trim();
      if (!videoUrl) {
        reject(new Error('Failed to get video URL'));
        return;
      }

      resolve(videoUrl);
    });

    ytdlp.on('error', (error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
    });
  });
};

export const getAudioStream = async (url: string): Promise<Buffer> => {
  "use server";
  
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtemp(path.join(os.tmpdir(), 'moonlit-yt-'));

    tmpDir.then((dir) => {
      const outputTemplate = path.join(dir, '%(id)s.%(ext)s');

      const args = [
        '--format', 'bestaudio/best',
        '--output', outputTemplate,
        '--no-playlist',
        url
      ];

      if (process.env.PROXY) {
        args.unshift('--proxy', process.env.PROXY);
      }

      const ytdlp = spawn('yt-dlp', args);
      
      let stderr = '';

      ytdlp.stdout.on('data', () => {});

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytdlp.on('close', async (code) => {
        try {
          if (code !== 0) {
            const userFriendlyMessage = parseYtDlpError(stderr);
            reject(new Error(userFriendlyMessage));
            return;
          }

          const files = await fs.readdir(dir);
          const mediaFile = files.find((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'));
          if (!mediaFile) {
            reject(new Error('Failed to locate downloaded audio file.'));
            return;
          }
          const filePath = path.join(dir, mediaFile);
          const buffer = await fs.readFile(filePath);

          try {
            await Promise.all(files.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})));
            await fs.rmdir(dir).catch(() => {});
          } catch {}

          resolve(buffer);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Unknown error reading audio file'));
        }
      });

      ytdlp.on('error', (error) => {
        reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
      });
    }).catch((err) => reject(err instanceof Error ? err : new Error('Failed to create temp dir')));
  });
};
