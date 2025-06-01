import { spawn } from 'child_process';

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
      '--dump-json',
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
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
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
        reject(new Error(`Failed to parse yt-dlp output: ${error}`));
      }
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
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
        return;
      }

      resolve(Buffer.concat(chunks));
    });

    ytdlp.on('error', (error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
    });
  });
};
