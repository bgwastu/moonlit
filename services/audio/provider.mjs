import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AudioError } from "./errors.mjs";

export class SabrProvider {
  constructor({ maxSessions = 4, proxy = process.env.PROXY_URL } = {}) {
    this.groups = new Map();
    this.maxSessions = maxSessions;
    this.proxy = proxy;
  }

  group(scope, cookies) {
    let group = this.groups.get(scope);
    if (group) {
      group.usedAt = Date.now();
      return group;
    }
    if (this.groups.size >= this.maxSessions) {
      const idle = [...this.groups.values()]
        .filter((g) => !g.pending.size)
        .sort((a, b) => a.usedAt - b.usedAt)[0];
      if (!idle)
        throw new AudioError(
          "AUDIO_BUSY",
          "The audio service is busy. Please try again shortly.",
          { status: 503, affectsHealth: false },
        );
      this.groups.delete(idle.scope);
      idle.worker.kill();
    }
    const worker = fork(
      fileURLToPath(new URL("./provider-session.mjs", import.meta.url)),
      [],
      {
        execArgv: [],
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        serialization: "advanced",
      },
    );
    worker.send({ type: "initialize", cookies, proxy: this.proxy });
    group = { worker, scope, usedAt: Date.now(), initialized: false, pending: new Map() };
    this.groups.set(scope, group);
    worker.on("message", (message) => {
      if (message.type === "initialized") {
        group.initialized = true;
        for (const pending of group.pending.values()) {
          worker.send(pending.message);
          if (pending.aborted) worker.send({ type: "cancel", id: pending.message.id });
        }
        return;
      }
      const pending = group.pending.get(message.id);
      if (!pending) return;
      if (message.type === "progress") {
        pending.progress(message);
        return;
      }
      group.pending.delete(message.id);
      pending.cleanup();
      if (message.type === "ready") pending.resolve(message.result);
      else
        pending.reject(
          Object.assign(
            new AudioError(message.error.code, message.error.error, message.error),
            message.error,
          ),
        );
    });
    const fail = () => {
      if (this.groups.get(scope) === group) this.groups.delete(scope);
      for (const pending of group.pending.values()) {
        pending.cleanup();
        pending.reject(
          new AudioError(
            "WORKER_RESTARTED",
            "The audio session restarted. Please retry playback.",
            { status: 503, retryable: true },
          ),
        );
      }
      group.pending.clear();
    };
    worker.on("error", fail);
    worker.on("exit", fail);
    return group;
  }

  download(spec, progress, signal) {
    signal.throwIfAborted();
    const group = this.group(spec.scope, spec.cookies);
    return new Promise((resolve, reject) => {
      const abort = () => {
        const pending = group.pending.get(spec.id);
        if (pending) pending.aborted = true;
        if (group.initialized) group.worker.send({ type: "cancel", id: spec.id });
      };
      signal.addEventListener("abort", abort, { once: true });
      group.pending.set(spec.id, {
        resolve,
        reject,
        progress,
        message: { ...spec, cookies: undefined, type: "download" },
        cleanup: () => signal.removeEventListener("abort", abort),
      });
      if (group.initialized)
        group.worker.send({ ...spec, cookies: undefined, type: "download" });
    });
  }

  async close() {
    await Promise.all(
      [...this.groups.values()].map(
        (g) =>
          new Promise((resolve) => {
            g.worker.once("exit", resolve);
            if (!g.worker.kill()) resolve();
          }),
      ),
    );
    this.groups.clear();
  }

  reapIdle() {
    for (const [scope, group] of this.groups) {
      if (!group.pending.size && group.usedAt < Date.now() - 15 * 60000) {
        this.groups.delete(scope);
        group.worker.kill();
      }
    }
  }
}
