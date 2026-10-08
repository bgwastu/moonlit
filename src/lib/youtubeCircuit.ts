const WINDOW_MS = 5 * 60 * 1000;
const OPEN_MS = 2 * 60 * 1000;
const MIN_SAMPLES = 4;
const FAILURE_RATIO = 0.5;

type Sample = { at: number; ok: boolean };

const circuits = new Map<string, { samples: Sample[]; openUntil: number }>();
function circuitFor(key: string) {
  if (!circuits.has(key)) circuits.set(key, { samples: [], openUntil: 0 });
  return circuits.get(key)!;
}

function prune(samples: Sample[], now: number) {
  while (samples.length && samples[0].at < now - WINDOW_MS) {
    samples.shift();
  }
}

export class YoutubeCircuitOpenError extends Error {
  readonly retryAfterSec: number;

  constructor(retryAfterSec: number) {
    super("YouTube is temporarily unavailable. Please try again shortly.");
    this.name = "YoutubeCircuitOpenError";
    this.retryAfterSec = retryAfterSec;
  }
}

export function assertYoutubeCircuitClosed(key = "search"): void {
  const now = Date.now();
  const { openUntil } = circuitFor(key);
  if (now < openUntil) {
    throw new YoutubeCircuitOpenError(Math.max(1, Math.ceil((openUntil - now) / 1000)));
  }
}

function recordYoutubeOutcome(ok: boolean, key: string): void {
  const now = Date.now();
  const circuit = circuitFor(key);
  const samples = circuit.samples;
  samples.push({ at: now, ok });
  prune(samples, now);

  if (samples.length < MIN_SAMPLES) return;

  const failures = samples.filter((s) => !s.ok).length;
  if (failures / samples.length >= FAILURE_RATIO) {
    circuit.openUntil = now + OPEN_MS;
    console.warn(
      `[Moonlit] YouTube circuit open for ${OPEN_MS / 1000}s (${failures}/${samples.length} failures)`,
    );
  }
}

export async function withYoutubeCircuit<T>(
  fn: () => Promise<T>,
  key = "search",
): Promise<T> {
  assertYoutubeCircuitClosed(key);
  try {
    const result = await fn();
    recordYoutubeOutcome(true, key);
    return result;
  } catch (error) {
    if (
      (error as Error)?.name !== "AbortError" &&
      !["CONTENT_UNAVAILABLE", "AUTH_REQUIRED", "INVALID_COOKIES"].includes(
        (error as any)?.code,
      )
    )
      recordYoutubeOutcome(false, key);
    throw error;
  }
}
