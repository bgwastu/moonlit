import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AudioError } from "../errors.mjs";
import { createAudioService } from "../server.mjs";

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "moonlit-audio-test-"));
  const audio = path.join(directory, "tone.m4a");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100",
    "-t",
    "45",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    audio,
  ]);
  return { directory, audio };
}

function provider(audio, { delay = 0, failure, corrupt = false } = {}) {
  const state = { downloads: 0, cancelled: 0 };
  return {
    state,
    async close() {},
    async download(spec, progress, signal) {
      state.downloads++;
      progress({ state: "downloading", percent: 40 });
      if (delay)
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
          }, delay);
          const abort = () => {
            clearTimeout(timer);
            state.cancelled++;
            reject(signal.reason);
          };
          signal.addEventListener("abort", abort, { once: true });
        });
      signal.throwIfAborted();
      if (failure) throw failure;
      if (corrupt) await writeFile(spec.inputPath, "truncated media");
      else await copyFile(audio, spec.inputPath);
      return {
        duration: 45,
        metadata: { title: "Test audio", author: "Fixture", thumbnail: "" },
      };
    },
  };
}

async function start(directory, source, options = {}) {
  const service = await createAudioService({
    directory: path.join(directory, "cache"),
    secret: "test-private-secret",
    provider: source,
    ...options,
  });
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const request = (url, init = {}) =>
    fetch(base + url, {
      ...init,
      headers: {
        Authorization: "Bearer test-private-secret",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  return { ...service, base, request };
}

async function ready(service, job) {
  for (let i = 0; i < 300; i++) {
    const next = await (
      await service.request(`/v1/jobs/${job.jobId}?lease=${job.leaseId || ""}`)
    ).json();
    if (["ready", "failed", "cancelled"].includes(next.state)) return next;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Job did not complete");
}

test("validated audio survives restart, supports complete downloads and exact ranges, and is credential scoped", async () => {
  const { directory, audio } = await fixture();
  const source = provider(audio);
  let service = await start(directory, source);
  try {
    assert.equal((await fetch(service.base + "/v1/jobs")).status, 401);
    const first = await (
      await service.request("/v1/jobs", {
        method: "POST",
        body: JSON.stringify({ videoId: "aaaaaaaaaaa" }),
      })
    ).json();
    const job = await ready(service, first);
    assert.equal(job.state, "ready");
    assert.ok(job.asset.size > 524288);
    const full = await service.request(`/v1/assets/${job.asset.id}`);
    assert.equal(full.status, 200);
    const bytes = Buffer.from(await full.arrayBuffer());
    assert.equal(bytes.length, job.asset.size);
    for (const [range, startAt, endAt] of [
      ["bytes=0-262143", 0, 262143],
      ["bytes=524288-", 524288, bytes.length - 1],
      ["bytes=-128", bytes.length - 128, bytes.length - 1],
    ]) {
      const response = await service.request(`/v1/assets/${job.asset.id}`, {
        headers: { Range: range },
      });
      assert.equal(response.status, 206);
      assert.equal(
        response.headers.get("content-range"),
        `bytes ${startAt}-${endAt}/${bytes.length}`,
      );
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        bytes.subarray(startAt, endAt + 1),
      );
    }
    const invalid = await service.request(`/v1/assets/${job.asset.id}`, {
      headers: { Range: "bytes=99999999-" },
    });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get("content-range"), `bytes */${bytes.length}`);
    const originalHealth = await (
      await service.request("/v1/health", { method: "POST", body: "{}" })
    ).json();
    const hit = await (
      await service.request("/v1/jobs", {
        method: "POST",
        body: JSON.stringify({ videoId: "aaaaaaaaaaa" }),
      })
    ).json();
    assert.equal(hit.state, "ready");
    assert.equal(hit.cached, true);
    assert.equal(source.state.downloads, 1);
    const healthAfterCache = await (
      await service.request("/v1/health", { method: "POST", body: "{}" })
    ).json();
    assert.equal(originalHealth.checkedAt, healthAfterCache.checkedAt);
    await service.close();
    const nextSource = provider(audio);
    service = await start(directory, nextSource);
    const persisted = await (
      await service.request("/v1/jobs", {
        method: "POST",
        body: JSON.stringify({ videoId: "aaaaaaaaaaa" }),
      })
    ).json();
    assert.equal(persisted.cached, true);
    assert.equal(nextSource.state.downloads, 0);
    const authenticated = await (
      await service.request("/v1/jobs", {
        method: "POST",
        body: JSON.stringify({
          videoId: "aaaaaaaaaaa",
          mode: "user",
          cookies: "session=private-value",
        }),
      })
    ).json();
    assert.equal((await ready(service, authenticated)).state, "ready");
    assert.equal(nextSource.state.downloads, 1);
    assert.equal(
      (await readFile(path.join(directory, "cache", "audio.sqlite"))).includes(
        Buffer.from("private-value"),
      ),
      false,
    );
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("coalesced callers have independent cancellation leases", async () => {
  const { directory, audio } = await fixture();
  const source = provider(audio, { delay: 2000 });
  const service = await start(directory, source);
  try {
    const create = async () =>
      (
        await service.request("/v1/jobs", {
          method: "POST",
          body: JSON.stringify({ videoId: "bbbbbbbbbbb" }),
        })
      ).json();
    const a = await create();
    const b = await create();
    assert.equal(a.jobId, b.jobId);
    assert.notEqual(a.leaseId, b.leaseId);
    await service.request(`/v1/jobs/${a.jobId}?lease=${a.leaseId}`, { method: "DELETE" });
    assert.notEqual(
      (await (await service.request(`/v1/jobs/${b.jobId}?lease=${b.leaseId}`)).json())
        .state,
      "cancelled",
    );
    await service.request(`/v1/jobs/${b.jobId}?lease=${b.leaseId}`, { method: "DELETE" });
    assert.equal((await ready(service, b)).state, "cancelled");
    assert.equal(source.state.downloads, 1);
    assert.equal(source.state.cancelled, 1);
    const health = await (
      await service.request("/v1/health", { method: "POST", body: "{}" })
    ).json();
    assert.equal(health.state, "unknown");
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("corrupt media is never published and playback failure cannot be reported healthy", async () => {
  const { directory, audio } = await fixture();
  const service = await start(directory, provider(audio, { corrupt: true }));
  try {
    const created = await (
      await service.request("/v1/jobs", {
        method: "POST",
        body: JSON.stringify({ videoId: "ccccccccccc" }),
      })
    ).json();
    const failed = await ready(service, created);
    assert.equal(failed.state, "failed");
    assert.equal(failed.error.code, "AUDIO_INCOMPLETE");
    assert.equal(service.store.assets().length, 0);
    const health = await (
      await service.request("/v1/health", { method: "POST", body: "{}" })
    ).json();
    assert.equal(health.state, "degraded");
    assert.equal(health.error.code, "AUDIO_INCOMPLETE");
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("an inaccessible item does not trip the service health or expose credentials", async () => {
  const { directory, audio } = await fixture();
  const service = await start(
    directory,
    provider(audio, {
      failure: new AudioError("CONTENT_UNAVAILABLE", "Track unavailable", {
        affectsHealth: false,
        status: 422,
      }),
    }),
  );
  try {
    service.store.outcome("anonymous", null);
    const created = await (
      await service.request("/v1/jobs", {
        method: "POST",
        body: JSON.stringify({ videoId: "ddddddddddd" }),
      })
    ).json();
    const failed = await ready(service, created);
    assert.equal(failed.error.code, "CONTENT_UNAVAILABLE");
    const health = await (
      await service.request("/v1/health", { method: "POST", body: "{}" })
    ).json();
    assert.equal(health.state, "healthy");
    assert.equal(health.lastItemError.code, "CONTENT_UNAVAILABLE");
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
});
