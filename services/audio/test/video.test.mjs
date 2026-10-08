import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { AudioError } from "../errors.mjs";
import { createAudioService } from "../server.mjs";
import { selectVideoFormat } from "../video-format.mjs";

let fixtures, video, audio;
before(async () => {
  fixtures = await mkdtemp(path.join(os.tmpdir(), "moonlit-video-fixtures-"));
  video = path.join(fixtures, "video.mp4");
  audio = path.join(fixtures, "audio.m4a");
  const encoders = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const encoder = encoders.includes("libx264") ? "libx264" : "h264_videotoolbox";
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100",
    "-t",
    "12",
    "-c:v",
    encoder,
    "-b:v",
    "1500k",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    video,
  ]);
  execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vn", "-c:a", "copy", audio]);
});
after(async () => {
  await rm(fixtures, { recursive: true, force: true });
});

async function start(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "moonlit-video-test-"));
  const downloads = [];
  let cancellations = 0;
  const provider = {
    async close() {},
    async download(spec, progress, signal) {
      downloads.push({ kind: spec.kind, videoId: spec.videoId });
      progress({ state: "downloading", percent: 20 });
      if (spec.kind === "video") {
        if (options.failure) throw options.failure;
        if (options.delay)
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, options.delay);
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                cancellations++;
                reject(signal.reason);
              },
              { once: true },
            );
          });
        if (options.corrupt) await writeFile(spec.inputPath, "broken video");
        else await copyFile(video, spec.inputPath);
      } else await copyFile(audio, spec.inputPath);
      signal.throwIfAborted();
      return {
        duration: options.incomplete && spec.kind === "video" ? 60 : 12,
        metadata: { title: "Native video", author: "Fixture", thumbnail: "" },
      };
    },
  };
  const service = await createAudioService({
    directory,
    secret: "test-secret",
    provider,
    videoOptions: options.videoOptions,
  });
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const request = (url, init = {}) =>
    fetch(base + url, {
      ...init,
      headers: {
        Authorization: "Bearer test-secret",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  const create = async (kind = "video", videoId = "aaaaaaaaaaa", credentials = {}) =>
    (
      await request("/v1/jobs", {
        method: "POST",
        body: JSON.stringify({ kind, videoId, ...credentials }),
      })
    ).json();
  return {
    ...service,
    request,
    create,
    directory,
    downloads,
    cancellations: () => cancellations,
    async dispose() {
      await service.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
async function finish(service, job) {
  for (let i = 0; i < 250; i++) {
    const next = await (
      await service.request(`/v1/jobs/${job.jobId}?lease=${job.leaseId || ""}`)
    ).json();
    if (["ready", "failed", "cancelled"].includes(next.state)) return next;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Video job did not finish");
}

test("video is validated, silent, seekable and cached independently from audio, including after restart", async () => {
  const service = await start();
  let reopened;
  try {
    const audioJob = await finish(service, await service.create("audio"));
    const job = await finish(service, await service.create());
    assert.equal(job.state, "ready");
    assert.equal(job.kind, "video");
    assert.equal(job.asset.contentType, "video/mp4");
    assert.notEqual(job.asset.id, audioJob.asset.id);
    const full = await service.request(`/v1/assets/${job.asset.id}`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("content-type"), "video/mp4");
    const bytes = Buffer.from(await full.arrayBuffer());
    assert.equal(bytes.length, job.asset.size);
    // Fast-start MP4 metadata precedes media; no audio stream is published.
    assert.ok(bytes.indexOf(Buffer.from("moov")) < bytes.indexOf(Buffer.from("mdat")));
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          service.videoJobs.assetPath(job.asset.id),
        ],
        { encoding: "utf8" },
      ),
    );
    assert.deepEqual(
      probe.streams.map((stream) => stream.codec_type),
      ["video"],
    );
    assert.equal(probe.streams[0].codec_name, "h264");
    for (const [range, startAt, endAt] of [
      ["bytes=0-255", 0, 255],
      ["bytes=524288-", 524288, bytes.length - 1],
      ["bytes=-512", bytes.length - 512, bytes.length - 1],
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
    assert.equal(
      (
        await service.request(`/v1/assets/${job.asset.id}`, {
          headers: { Range: `bytes=${bytes.length}-` },
        })
      ).status,
      416,
    );
    const head = await service.request(`/v1/assets/${job.asset.id}`, { method: "HEAD" });
    assert.equal(head.headers.get("content-type"), "video/mp4");
    assert.equal(Number(head.headers.get("content-length")), bytes.length);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await service.create()).cached, true);
    assert.equal((await service.create("audio")).cached, true);
    assert.equal(service.downloads.length, 2);
    await service.close();
    // Older audio records had neither kind nor contentType; upgrading preserves them.
    const { AudioStore } = await import("../store.mjs");
    const store = new AudioStore(service.directory);
    const old = store.getAsset(audioJob.asset.id);
    delete old.kind;
    delete old.contentType;
    store.putAsset(old);
    store.close();
    const source = {
      async close() {},
      async download() {
        throw new Error("Unexpected upstream request");
      },
    };
    reopened = await createAudioService({
      directory: service.directory,
      secret: "test-secret",
      provider: source,
    });
    assert.equal(reopened.videoJobs.create("aaaaaaaaaaa").cached, true);
    assert.equal(reopened.jobs.create("aaaaaaaaaaa").cached, true);
    assert.equal(
      (await stat(reopened.videoJobs.assetPath(job.asset.id))).size,
      bytes.length,
    );
  } finally {
    if (reopened) await reopened.close();
    await service.dispose();
  }
});

test("video LRU never evicts audio and user cookies isolate video assets", async () => {
  const service = await start({
    videoOptions: { cacheBytes: Math.ceil((await stat(video)).size * 1.3) },
  });
  try {
    const audioJob = await finish(service, await service.create("audio"));
    const first = await finish(service, await service.create());
    const second = await finish(service, await service.create("video", "bbbbbbbbbbb"));
    assert.equal(second.state, "ready");
    assert.equal((await service.request(`/v1/assets/${first.asset.id}`)).status, 410);
    assert.equal((await service.request(`/v1/assets/${audioJob.asset.id}`)).status, 200);
    assert.equal((await service.create("audio")).cached, true);
    const privateJob = await finish(
      service,
      await service.create("video", "bbbbbbbbbbb", {
        mode: "user",
        cookies: "session=video-private-value",
      }),
    );
    assert.equal(privateJob.state, "ready");
    assert.notEqual(privateJob.asset.id, second.asset.id);
    assert.equal(
      (await readFile(path.join(service.directory, "audio.sqlite"))).includes(
        Buffer.from("video-private-value"),
      ),
      false,
    );
  } finally {
    await service.dispose();
  }
});

test("video leases coalesce, cancellation is isolated and audio is not queued behind video", async () => {
  const service = await start({ delay: 10000 });
  try {
    const first = await service.create();
    const second = await service.create();
    assert.equal(first.jobId, second.jobId);
    assert.notEqual(first.leaseId, second.leaseId);
    const audioJob = await finish(service, await service.create("audio"));
    assert.equal(audioJob.state, "ready");
    await service.request(`/v1/jobs/${first.jobId}?lease=${first.leaseId}`, {
      method: "DELETE",
    });
    assert.notEqual(
      (
        await (
          await service.request(`/v1/jobs/${second.jobId}?lease=${second.leaseId}`)
        ).json()
      ).state,
      "cancelled",
    );
    await service.request(`/v1/jobs/${second.jobId}?lease=${second.leaseId}`, {
      method: "DELETE",
    });
    assert.equal((await finish(service, second)).state, "cancelled");
    assert.equal(service.cancellations(), 1);
    assert.equal(service.store.health("anonymous").state, "healthy");
  } finally {
    await service.dispose();
  }
});

for (const options of [
  { corrupt: true },
  { incomplete: true },
  { failure: new AudioError("YOUTUBE_BLOCKED", "Video session rejected") },
]) {
  test(`optional video failure leaves healthy audio intact (${Object.keys(options)[0]})`, async () => {
    const service = await start(options);
    try {
      service.store.outcome("anonymous", null);
      const failed = await finish(service, await service.create());
      assert.equal(failed.state, "failed");
      assert.equal(failed.error.affectsHealth, false);
      assert.equal(service.store.assets().length, 0);
      assert.equal(service.store.health("anonymous").state, "healthy");
      assert.equal((await finish(service, await service.create("audio"))).state, "ready");
    } finally {
      await service.dispose();
    }
  });
}

test("video selection favors compatible 480p, falls back for size, and rejects unsupported formats", () => {
  const format = (height, length, codec = "avc1.4d401f") => ({
    height,
    contentLength: length,
    mimeType: `video/mp4; codecs="${codec}"`,
    bitrate: 1000000,
    itag: height,
  });
  assert.equal(
    selectVideoFormat(
      [
        format(1080, 10),
        format(480, 100),
        format(360, 50),
        format(480, 10, "av01.0.05M.08"),
      ],
      200,
      10,
    ).height,
    480,
  );
  assert.equal(
    selectVideoFormat([format(480, 100), format(360, 50)], 60, 10).height,
    360,
  );
  assert.throws(
    () =>
      selectVideoFormat([format(1080, 10), format(480, 10, "vp09.00.31.08")], 200, 10),
    { code: "VIDEO_UNAVAILABLE" },
  );
  assert.throws(() => selectVideoFormat([format(480, 100)], 60, 10), {
    code: "VIDEO_TOO_LARGE",
  });
  assert.throws(() => selectVideoFormat([format(480, 0)], 60, 10), {
    code: "VIDEO_TOO_LARGE",
  });
});
