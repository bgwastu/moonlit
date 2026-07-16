const WINDOW_MS = 5 * 60 * 1000;
const OPEN_MS = 2 * 60 * 1000;
const MIN_SAMPLES = 4;
const FAILURE_RATIO = 0.5;

type Sample = { at: number; ok: boolean };

const samples: Sample[] = [];
let openUntil = 0;

function prune(now: number) {
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

export function assertYoutubeCircuitClosed(): void {
  const now = Date.now();
  if (now < openUntil) {
    throw new YoutubeCircuitOpenError(Math.max(1, Math.ceil((openUntil - now) / 1000)));
  }
}

export function recordYoutubeOutcome(ok: boolean): void {
  const now = Date.now();
  samples.push({ at: now, ok });
  prune(now);

  if (samples.length < MIN_SAMPLES) return;

  const failures = samples.filter((s) => !s.ok).length;
  if (failures / samples.length >= FAILURE_RATIO) {
    openUntil = now + OPEN_MS;
    console.warn(
      `[Moonlit] YouTube circuit open for ${OPEN_MS / 1000}s (${failures}/${samples.length} failures)`,
    );
  }
}

export async function withYoutubeCircuit<T>(fn: () => Promise<T>): Promise<T> {
  assertYoutubeCircuitClosed();
  try {
    const result = await fn();
    recordYoutubeOutcome(true);
    return result;
  } catch (error) {
    recordYoutubeOutcome(false);
    throw error;
  }
}
