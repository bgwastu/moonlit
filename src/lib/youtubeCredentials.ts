import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readRequestCookiesResult, sanitizeUserCookies } from "@/lib/cookies";
import { youtubeCookieHeader } from "../../services/audio/credentials.mjs";

export type YoutubeCredentials = {
  mode: "anonymous" | "user" | "system";
  cookies?: string;
  scope: string;
};

export async function requestYoutubeCredentials(request: Request, bodyCookies?: unknown) {
  const supplied = readRequestCookiesResult(request);
  const cookies =
    supplied.status === "ok" ? supplied.cookies : sanitizeUserCookies(bodyCookies);
  if (supplied.status === "invalid" || (bodyCookies && !cookies))
    throw Object.assign(
      new Error(
        supplied.status === "invalid" ? supplied.error : "Invalid YouTube cookies.",
      ),
      {
        code: "INVALID_COOKIES",
        status: 400,
      },
    );
  return resolveYoutubeCredentials(cookies);
}

export async function resolveYoutubeCredentials(
  userCookies?: string,
): Promise<YoutubeCredentials> {
  let mode: YoutubeCredentials["mode"] = "anonymous";
  let content = "";
  if (userCookies?.trim()) {
    mode = "user";
    content = userCookies;
  } else if (process.env.YOUTUBE_CREDENTIAL_MODE === "system") {
    mode = "system";
    try {
      content = await readFile(path.join(process.cwd(), "data", "cookies.txt"), "utf8");
    } catch {
      throw Object.assign(
        new Error("System account mode requires a YouTube cookie export."),
        { code: "INVALID_COOKIES", status: 400 },
      );
    }
  }
  const cookies = mode === "anonymous" ? undefined : youtubeCookieHeader(content);
  if (mode !== "anonymous" && !cookies)
    throw Object.assign(
      new Error("The cookie export contains no current cookies for youtube.com."),
      { code: "INVALID_COOKIES", status: 400 },
    );
  const scope =
    mode === "anonymous"
      ? "anonymous"
      : createHash("sha256").update(`${mode}\0${cookies}`).digest("hex");
  return { mode, cookies, scope };
}
