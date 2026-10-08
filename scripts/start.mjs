import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const dev = process.argv.includes("--dev");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 10000);
  timer.unref();
  Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) resolve();
          else child.once("exit", resolve);
        }),
    ),
  ).then(() => process.exit(code));
}
function start(script, args = []) {
  const child = spawn(process.execPath, [script, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);
  child.once("error", () => stop(1));
  child.once("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
if (!process.env.AUDIO_WORKER_URL) start(path.resolve("services/audio/server.mjs"));
if (dev) start(path.resolve("node_modules/next/dist/bin/next"), ["dev"]);
else if (existsSync("server.js")) start(path.resolve("server.js"));
else start(path.resolve("node_modules/next/dist/bin/next"), ["start"]);
process.once("SIGTERM", () => stop());
process.once("SIGINT", () => stop());
