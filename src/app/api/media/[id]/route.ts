import { promises as fs } from "fs";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { getTempDir } from "@/utils/server";

const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const META_SUFFIX = ".json";

interface MediaMeta {
  contentType?: string;
  filename?: string;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new Response("Invalid ID", { status: 400 });
  }

  const tmpDir = path.join(getTempDir(), "moonlit-media");
  const filePath = path.join(tmpDir, id);
  const metaPath = `${filePath}${META_SUFFIX}`;

  if (!existsSync(filePath)) {
    return new Response("File not found", { status: 404 });
  }

  const stat = await fs.stat(filePath);
  const meta = await readMediaMeta(metaPath);

  const stream = createReadStream(filePath);

  // Clean up the file after the stream is closed (finished or error)
  stream.on("close", () => {
    fs.unlink(filePath).catch(() => {});
    fs.unlink(metaPath).catch(() => {});
  });

  return new Response(stream as any, {
    headers: {
      "Content-Type": meta.contentType || DEFAULT_CONTENT_TYPE,
      "Content-Length": stat.size.toString(),
      "Content-Disposition": `attachment; filename="${escapeHeaderFilename(meta.filename || id)}"`,
    },
  });
}

async function readMediaMeta(metaPath: string): Promise<MediaMeta> {
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf-8")) as MediaMeta;
  } catch {
    return {};
  }
}

function escapeHeaderFilename(filename: string): string {
  return filename.replace(/["\r\n]/g, "");
}
