import { apiError } from "@/lib/apiError";
import { audioJobResponse } from "@/lib/audioJobResponse";
import { AudioJob, workerJson, workerRequest } from "@/lib/audioWorker";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

type Context = { params: Promise<{ jobId: string }> };

function endpoint(request: Request, jobId: string) {
  if (!/^[a-f0-9]{32}$/.test(jobId)) return null;
  const lease = new URL(request.url).searchParams.get("lease");
  if (lease && !/^[a-f0-9]{32}$/.test(lease)) return null;
  return `/v1/jobs/${jobId}${lease ? `?lease=${lease}` : ""}`;
}

export async function GET(request: Request, context: Context) {
  const limit = checkRateLimit(`audio:jobs:${getClientIp(request)}`, 240, 60000);
  if (limit.ok === false) return rateLimitResponse(limit.retryAfterSec);
  const url = endpoint(request, (await context.params).jobId);
  if (!url) return apiError("Invalid audio job", 400);
  try {
    return audioJobResponse(await workerJson<AudioJob>(url, { signal: request.signal }));
  } catch (error) {
    return apiError(
      (error as Error).message,
      (error as any).status || 503,
      undefined,
      (error as any).code,
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  const url = endpoint(request, (await context.params).jobId);
  if (!url) return apiError("Invalid audio job", 400);
  try {
    await workerRequest(url, { method: "DELETE" });
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
