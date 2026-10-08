import assert from "node:assert/strict";
import test from "node:test";
import { youtubeCookieHeader } from "../credentials.mjs";
import { checkPlayability, publicError } from "../errors.mjs";
import { credentialScope } from "../jobs.mjs";

test("HttpOnly export rows survive while expired and unrelated cookies are removed", () => {
  const cookies = [
    "# Netscape HTTP Cookie File",
    "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t2000\tLOGIN_INFO\taccount=value",
    ".youtube.com\tTRUE\t/\tTRUE\t500\tSID\texpired",
    ".google.com\tTRUE\t/\tTRUE\t2000\tSID\tunrelated",
    ".youtube.com\tTRUE\t/other\tTRUE\t2000\tSID\twrongpath",
    ".youtube.com\tTRUE\t/\tTRUE\t0\tPREF\tsession-cookie",
  ].join("\n");
  assert.equal(
    youtubeCookieHeader(cookies, 1000000),
    "LOGIN_INFO=account=value; PREF=session-cookie",
  );
  assert.equal(credentialScope("anonymous", cookies), "anonymous");
  assert.notEqual(credentialScope("user", cookies), credentialScope("system", cookies));
});

test("bot challenges and invalid requests are separate from account and item restrictions", () => {
  assert.equal(
    publicError(new Error("Request failed with status code 400")).code,
    "YOUTUBE_CLIENT_ERROR",
  );
  assert.throws(
    () =>
      checkPlayability(
        {
          playabilityStatus: {
            status: "LOGIN_REQUIRED",
            reason: "Sign in to confirm you’re not a bot",
          },
        },
        "aaaaaaaaaaa",
      ),
    (error) => error.code === "YOUTUBE_BLOCKED",
  );
  assert.throws(
    () =>
      checkPlayability(
        {
          playabilityStatus: {
            status: "LOGIN_REQUIRED",
            reason: "Sign in to confirm your age",
          },
        },
        "aaaaaaaaaaa",
      ),
    (error) => error.code === "AUTH_REQUIRED" && error.affectsHealth === false,
  );
  assert.throws(
    () =>
      checkPlayability(
        { playabilityStatus: { status: "OK" }, videoDetails: { videoId: "bbbbbbbbbbb" } },
        "aaaaaaaaaaa",
      ),
    (error) => error.code === "YOUTUBE_CLIENT_ERROR",
  );
  assert.throws(
    () =>
      checkPlayability(
        { playabilityStatus: { status: "UNPLAYABLE", reason: "Private video" } },
        "aaaaaaaaaaa",
      ),
    (error) => error.code === "CONTENT_UNAVAILABLE" && error.affectsHealth === false,
  );
  assert.throws(
    () =>
      checkPlayability(
        { playabilityStatus: { status: "UNPLAYABLE", reason: "Video unavailable" } },
        "aaaaaaaaaaa",
      ),
    (error) => error.code === "YOUTUBE_ACCESS_DENIED" && error.affectsHealth === true,
  );
});
