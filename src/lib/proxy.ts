import { ProxyAgent, setGlobalDispatcher } from "undici";

let initialized = false;

function initProxy(): void {
  if (initialized) return;
  initialized = true;

  const proxyUrl = process.env.PROXY_URL?.trim();
  if (!proxyUrl) return;

  try {
    const agent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(agent);
    console.log(`[Moonlit] Proxy enabled: ${proxyUrl.replace(/\/\/[^@]*@/, "//***@")}`);
  } catch (e) {
    console.error("[Moonlit] Failed to initialize proxy:", e);
  }
}

initProxy();
