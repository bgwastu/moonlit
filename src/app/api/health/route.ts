import { workerJson } from "@/lib/audioWorker";

export const dynamic = "force-dynamic";

/** Deployment readiness stays independent of YouTube availability. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await workerJson("/v1/health", {
      method: "POST",
      body: "{}",
      timeoutMs: 3000,
    });
    return Response.json({ ready: true }, { headers });
  } catch {
    return Response.json({ ready: false }, { status: 503, headers });
  }
}
