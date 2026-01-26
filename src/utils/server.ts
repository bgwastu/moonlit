import os from "os";
import fs from "fs";

// Cache the result to avoid repeated mkdir calls
let tempDirCreated = false;

export function getTempDir(): string {
  const dir = process.env.TMPDIR || os.tmpdir();

  // Ensure the directory exists (especially if we redirect it to a volume path like /app/data/tmp)
  if (!tempDirCreated) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      tempDirCreated = true;
    } catch (e) {
      // Ignore error if parallel calls try to create it, or if we map to a read-only system (unlikely)
      console.warn("[Moonlit] Failed to ensure temp dir exists:", e);
    }
  }

  return dir;
}
