import { promises as fs } from "fs";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { getTempDir } from "@/utils/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new Response("Invalid ID", { status: 400 });
  }

  const tmpDir = path.join(getTempDir(), "moonlit-media");
  const filePath = path.join(tmpDir, id);

  if (!existsSync(filePath)) {
    return new Response("File not found", { status: 404 });
  }

  const stat = await fs.stat(filePath);

  const stream = createReadStream(filePath);

  // Clean up the file after the stream is closed (finished or error)
  stream.on("close", () => {
    fs.unlink(filePath).catch(() => {});
  });

  return new Response(stream as any, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": stat.size.toString(),
      "Content-Disposition": `attachment; filename="${id}"`,
    },
  });
}
