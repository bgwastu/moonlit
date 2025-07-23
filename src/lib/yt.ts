import { spawn } from 'child_process';

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
    const args = [
      '--format', 'best[ext=mp4]/best',
      '--output', '-',
      '--no-playlist',
      url
    ];

    // Add proxy if available
    if (process.env.PROXY) {
      args.unshift('--proxy', process.env.PROXY);
    }

    const ytdlp = spawn('yt-dlp', args);
    
    const chunks: Uint8Array[] = [];
    let stderr = '';

    ytdlp.stdout.on('data', (data: Buffer) => {
      chunks.push(new Uint8Array(data));
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

      resolve(Buffer.concat(chunks));
    });

    ytdlp.on('error', (error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
    });
  });
};

export const getVideoUrl = async (url: string): Promise<string> => {
  "use server";
  
  return new Promise((resolve, reject) => {
    const args = [
      '--format', 'best[ext=mp4]/best',
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
    const args = [
      '--format', 'bestaudio/best',
      '--output', '-',
      '--no-playlist',
      url
    ];

    // Add proxy if available
    if (process.env.PROXY) {
      args.unshift('--proxy', process.env.PROXY);
    }

    const ytdlp = spawn('yt-dlp', args);
    
    const chunks: Uint8Array[] = [];
    let stderr = '';

    ytdlp.stdout.on('data', (data: Buffer) => {
      chunks.push(new Uint8Array(data));
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

      resolve(Buffer.concat(chunks));
    });

    ytdlp.on('error', (error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
    });
  });
};
