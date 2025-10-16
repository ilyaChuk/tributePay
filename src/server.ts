import {
  ensureConfig,
  getKnownWebhookPaths,
  getWebhookSecret,
  normalizeWebhookPath,
  PORT,
} from "./config";
import { json } from "./http";
import { createWebhookHandler } from "./webhook";

ensureConfig();

const webhookHandlers = new Map<
  string,
  { secret: string; handler: (req: Request) => Promise<Response> }
>();

function getOrCreateWebhookHandler(pathname: string, secret: string) {
  const normalized = normalizeWebhookPath(pathname);
  const cached = webhookHandlers.get(normalized);
  if (cached && cached.secret === secret) {
    return cached.handler;
  }
  const handler = createWebhookHandler({ secret, endpoint: normalized });
  webhookHandlers.set(normalized, { secret, handler });
  return handler;
}

export function startServer() {
  const configuredPaths = getKnownWebhookPaths();
  if (configuredPaths.length > 0) {
    console.info(
      `[TributeServer] Webhook endpoints available: ${configuredPaths.join(", ")}`,
    );
  } else {
    console.warn("[TributeServer] No webhook endpoints are configured.");
  }

  return Bun.serve({
    port: PORT,
    fetch: async (req) => {
      const url = new URL(req.url);
      const pathname = normalizeWebhookPath(url.pathname);

      if (pathname === "/health") {
        return json({ ok: true });
      }

      const secret = getWebhookSecret(pathname);
      if (secret !== null) {
        const handler = getOrCreateWebhookHandler(pathname, secret);
        return handler(req);
      }

      console.warn(`[TributeServer] Unconfigured webhook endpoint requested: ${pathname}`);
      return json({ error: "not found" }, 404);
    },
  });
}

if (import.meta.main) {
  const server = startServer();
  console.log(`Tribute Pay webhook listening on http://localhost:${server.port}`);
}
