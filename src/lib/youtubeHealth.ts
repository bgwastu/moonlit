import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type CapabilityHealth = {
  state: "healthy" | "degraded" | "unknown";
  checkedAt: number;
  expiresAt: number;
  error?: { code?: string; error: string } | null;
};

const directory = path.join(process.cwd(), "data", "health");
export async function readCapability(
  scope: string,
  capability: "search" | "playback",
): Promise<CapabilityHealth> {
  try {
    const record = JSON.parse(
      await readFile(path.join(directory, `${scope}-${capability}.json`), "utf8"),
    );
    if (record.expiresAt > Date.now()) return record;
  } catch {}
  return { state: "unknown", checkedAt: 0, expiresAt: 0 };
}

export async function recordCapability(
  scope: string,
  capability: "search" | "playback",
  error?: unknown,
) {
  const checkedAt = Date.now();
  const record: CapabilityHealth = {
    state: error ? "degraded" : "healthy",
    checkedAt,
    expiresAt: checkedAt + (error ? 120000 : 600000),
    ...(error
      ? {
          error: {
            code: (error as any)?.code,
            error: (error as Error)?.message || "YouTube request failed.",
          },
        }
      : {}),
  };
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${scope}-${capability}.json`);
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
  await rename(temporary, file);
}
