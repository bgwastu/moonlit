export interface SignalsmithStretchInstance {
  connect(node: AudioNode): void;
  disconnect(): void;
  addBuffers(buffers: Float32Array[]): Promise<void>;
  seek(timeSeconds: number): void;
  stop(): void;
  schedule(opts: {
    active?: boolean;
    input?: number;
    rate?: number;
    semitones?: number;
    loopStart?: number;
    loopEnd?: number;
  }): void;
  inputTime: number;
  setTransposeSemitones(semitones: number): void;
  process(input: Float32Array[], output: Float32Array[], numFrames: number): void;
}

export type SignalsmithStretchFactory = (
  context: BaseAudioContext,
) => Promise<SignalsmithStretchInstance>;

/**
 * Load Signalsmith Stretch from a static public URL (not the bundler graph).
 *
 * The package stringifies its AudioWorklet + WASM into a Blob at runtime.
 * Bundling that factory (Turbopack/webpack) breaks worklet init, so we serve the
 * upstream ESM file from /public/vendor instead of importing the npm package.
 */
export async function loadSignalsmithStretch(): Promise<SignalsmithStretchFactory> {
  // Variable URL so TypeScript/bundlers treat this as a runtime import.
  const url = "/vendor/SignalsmithStretch.mjs";
  const mod = await import(
    /* webpackIgnore: true */
    /* turbopackIgnore: true */
    url
  );
  return (mod as { default: SignalsmithStretchFactory }).default;
}
