/**
 * Load Signalsmith Stretch from a static public URL (not the bundler graph).
 *
 * The package stringifies its AudioWorklet + WASM into a Blob at runtime.
 * Bundling that factory (Turbopack/webpack) breaks worklet init, so we serve the
 * upstream ESM file from /public/vendor instead of importing the npm package.
 */
export async function loadSignalsmithStretch() {
  // Variable URL so TypeScript/bundlers treat this as a runtime import.
  const url = "/vendor/SignalsmithStretch.mjs";
  const mod = await import(
    /* webpackIgnore: true */
    /* turbopackIgnore: true */
    url
  );
  return (mod as { default: unknown }).default;
}
