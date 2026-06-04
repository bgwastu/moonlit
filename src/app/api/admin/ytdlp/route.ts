import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { getVideoInfo } from "@/lib/yt-dlp";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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
  if (!ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Admin not configured" }, { status: 403 });
  }

  if (!verifyPassword(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action, url } = await request.json();

    if (action === "test") {
      if (!url) {
        return NextResponse.json({ error: "URL is required for test" }, { status: 400 });
      }

      try {
        const info = await getVideoInfo(url);
        return NextResponse.json({
          success: true,
          title: info.title,
          author: info.author,
          ...(info.artist && { artist: info.artist }),
          ...(info.album && { album: info.album }),
          duration: info.lengthSeconds,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Test failed";
        return NextResponse.json(
          { error: "Test failed", details: message },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Moonlit] Admin yt-dlp error:", error);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
