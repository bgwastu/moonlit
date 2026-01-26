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

  // Wait for the file to be opened before unlinking
  await new Promise<void>((resolve, reject) => {
    stream.on("open", () => resolve());
    stream.on("error", (err) => reject(err));
  });

  // POSIX (Mac/Linux) allow deleting a file while it has open file descriptors.
  // The file data remains available to the stream until it closes, but the directory entry is removed immediately.
  await fs.unlink(filePath).catch(() => {});

  return new Response(stream as any, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": stat.size.toString(),
      "Content-Disposition": `attachment; filename="${id}"`,
    },
  });
}
