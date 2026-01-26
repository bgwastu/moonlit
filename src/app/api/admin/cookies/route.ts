import { NextResponse } from "next/server";
import { promises as fs } from "fs";
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
  if (!ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Admin not configured" },
      { status: 403 },
    );
  }

  if (!verifyPassword(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (existsSync(SYSTEM_COOKIES_PATH)) {
      const cookies = await fs.readFile(SYSTEM_COOKIES_PATH, "utf-8");
      return NextResponse.json({ cookies });
    }
    return NextResponse.json({ cookies: "" });
  } catch (error) {
    console.error("[Moonlit] Error reading system cookies:", error);
    return NextResponse.json(
      { error: "Failed to read cookies" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Admin not configured" },
      { status: 403 },
    );
  }

  if (!verifyPassword(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { cookies } = await request.json();

    if (!existsSync(DATA_DIR)) {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }

    if (!cookies || !cookies.trim()) {
      await fs.writeFile(SYSTEM_COOKIES_PATH, "", "utf-8");
    } else {
      const normalized = cookies.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      await fs.writeFile(SYSTEM_COOKIES_PATH, normalized, "utf-8");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Moonlit] Error writing system cookies:", error);
    return NextResponse.json(
      { error: "Failed to save cookies" },
      { status: 500 },
    );
  }
}
