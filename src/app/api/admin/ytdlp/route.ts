import { NextResponse } from "next/server";
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATA_DIR = path.join(process.cwd(), "data");
const SYSTEM_COOKIES_PATH = path.join(DATA_DIR, "cookies.txt");

function verifyPassword(request: Request): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const password = authHeader.slice(7);
  return password === ADMIN_PASSWORD;
}

export async function GET(request: Request) {
  // Check if admin is enabled
  if (!ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Admin not configured" }, { status: 403 });
  }

  // Verify password
  if (!verifyPassword(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const version = execSync("yt-dlp --version", { encoding: "utf-8" }).trim();
    return NextResponse.json({ version });
  } catch (error) {
    console.error("[Moonlit] Error getting yt-dlp version:", error);
    return NextResponse.json({ error: "Failed to get version" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Check if admin is enabled
  if (!ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Admin not configured" }, { status: 403 });
  }

  // Verify password
  if (!verifyPassword(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action, url } = await request.json();

    if (action === "update") {
      // Update yt-dlp and EJS challenge solver (required for YouTube)
      const output = execSync("pip install --upgrade yt-dlp yt-dlp-ejs", {
        encoding: "utf-8",
        timeout: 120000, // 2 minute timeout
      });
      const newVersion = execSync("yt-dlp --version", {
        encoding: "utf-8",
      }).trim();
      return NextResponse.json({
        success: true,
        version: newVersion,
        output,
      });
    }

    if (action === "test") {
      if (!url) {
        return NextResponse.json({ error: "URL is required for test" }, { status: 400 });
      }

      // Test URL extraction
      return new Promise<Response>((resolve) => {
        const args = ["--skip-download", "-J", "--no-playlist", url];

        // Add system cookies if available
        if (existsSync(SYSTEM_COOKIES_PATH)) {
          args.unshift("--cookies", SYSTEM_COOKIES_PATH);
        }

        // Add proxy if configured
        if (process.env.PROXY) {
          args.unshift("--proxy", process.env.PROXY);
        }

        const proc = spawn("yt-dlp", args);
        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        proc.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          if (code === 0) {
            try {
              const info = JSON.parse(stdout);
              const artists = info.artists;
              const artist =
                Array.isArray(artists) && artists.length > 0
                  ? artists.join(", ")
                  : info.artist;
              const author = artist || info.uploader || info.channel;
              resolve(
                NextResponse.json({
                  success: true,
                  title: info.track || info.title,
                  author,
                  ...(artist && { artist }),
                  ...(info.album && { album: info.album }),
                  duration: info.duration,
                }),
              );
            } catch {
              resolve(
                NextResponse.json(
                  { error: "Failed to parse video info" },
                  { status: 500 },
                ),
              );
            }
          } else {
            resolve(
              NextResponse.json(
                {
                  error: "Test failed",
                  details: stderr.substring(0, 500),
                },
                { status: 400 },
              ),
            );
          }
        });

        proc.on("error", (error) => {
          resolve(
            NextResponse.json(
              { error: `Failed to run test: ${error.message}` },
              { status: 500 },
            ),
          );
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          proc.kill();
          resolve(NextResponse.json({ error: "Test timed out" }, { status: 504 }));
        }, 30000);
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Moonlit] Admin yt-dlp error:", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
