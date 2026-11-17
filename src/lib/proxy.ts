import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

let initialized = false;

function initProxy(): void {
  if (initialized) return;
  initialized = true;

  const proxyUrl = process.env.PROXY_URL?.trim();
  if (!proxyUrl) return;

  try {
    process.env.HTTP_PROXY ||= proxyUrl;
    process.env.HTTPS_PROXY ||= proxyUrl;
    process.env.NO_PROXY ||= "localhost,127.0.0.1,::1";
    setGlobalDispatcher(new EnvHttpProxyAgent());
    console.log(`[Moonlit] Proxy enabled: ${proxyUrl.replace(/\/\/[^@]*@/, "//***@")}`);
  } catch (e) {
    console.error("[Moonlit] Failed to initialize proxy:", e);
  }
}

initProxy();
