import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import path from "path";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATA_DIR = path.join(process.cwd(), "data");
const SYSTEM_COOKIES_PATH = path.join(DATA_DIR, "cookies.txt");

function assertAdmin(request: Request): NextResponse | undefined {
  if (!ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Admin not configured" }, { status: 403 });
  }
  const authHeader = request.headers.get("Authorization");
  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ") ||
    authHeader.slice(7) !== ADMIN_PASSWORD
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function GET(request: Request) {
  const err = assertAdmin(request);
  if (err) return err;

  try {
    const cookies = existsSync(SYSTEM_COOKIES_PATH)
      ? await fs.readFile(SYSTEM_COOKIES_PATH, "utf-8")
      : "";
    return NextResponse.json({ cookies });
  } catch {
    return NextResponse.json({ error: "Failed to read cookies" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const err = assertAdmin(request);
  if (err) return err;

  try {
    const { cookies } = await request.json();
    if (!existsSync(DATA_DIR)) {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }
    await fs.writeFile(SYSTEM_COOKIES_PATH, cookies || "", "utf-8");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save cookies" }, { status: 500 });
  }
}
