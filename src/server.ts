import { ensureConfig, PORT, TRIBUTE_SECRET } from "./config";
import { json } from "./http";
import { createWebhookHandler } from "./webhook";

ensureConfig();

const webhookHandler = createWebhookHandler({ secret: TRIBUTE_SECRET });

export function startServer() {
  return Bun.serve({
    port: PORT,
    fetch: async (req) => {
      const url = new URL(req.url);

      if (url.pathname === "/wh") {
        return webhookHandler(req);
      }

      if (url.pathname === "/health") {
        return json({ ok: true });
      }

      return json({ error: "not found" }, 404);
    },
  });
}

if (import.meta.main) {
  const server = startServer();
  console.log(`Tribute Pay webhook listening on http://localhost:${server.port}`);
}
