import {
  ensureConfig,
  getKnownWebhookPaths,
  getWebhookSecret,
  normalizeWebhookPath,
  PORT,
} from "./config";
import { json } from "./http";
import { createWebhookHandler } from "./webhook";
import {
  SubscriptionManager,
  type WebSocketData,
  type SubscriptionMessage,
} from "./subscriptions";

ensureConfig();

const webhookHandlers = new Map<
  string,
  { secret: string; handler: (req: Request) => Promise<Response> }
>();
const subscriptions = new SubscriptionManager();

function getOrCreateWebhookHandler(pathname: string, secret: string) {
  const normalized = normalizeWebhookPath(pathname);
  const cached = webhookHandlers.get(normalized);
  if (cached && cached.secret === secret) {
    return cached.handler;
  }
  const handler = createWebhookHandler({
    secret,
    endpoint: normalized,
    onEvent: ({ endpoint, event, result, receivedAt }) => {
      const message: SubscriptionMessage = {
        type: "event",
        endpoint: endpoint ?? normalized,
        event,
        metadata: {
          status: result.status,
          response: result.body ?? null,
          receivedAt,
        },
      };
      subscriptions.broadcast(normalized, message);
    },
  });
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

  return Bun.serve<WebSocketData>({
    port: PORT,
    fetch: async (req, server) => {
      const url = new URL(req.url);
      const pathname = normalizeWebhookPath(url.pathname);

      if (pathname === "/ws") {
        const endpointParam =
          url.searchParams.get("endpoint") ?? url.searchParams.get("path") ?? "";
        const endpoint = normalizeWebhookPath(endpointParam);
        if (!endpoint || endpoint === "/") {
          return json({ error: "missing endpoint parameter" }, 400);
        }
        const secret = getWebhookSecret(endpoint);
        if (secret === null) {
          return json({ error: "unknown endpoint", endpoint }, 404);
        }
        const upgraded = server.upgrade(req, {
          data: { endpoint },
        });
        if (upgraded) {
          return;
        }
        return json({ error: "upgrade failed" }, 400);
      }

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
    websocket: {
      maxPayloadLength: 1024 * 1024 * 5,
      open(socket) {
        const endpoint = socket.data?.endpoint;
        if (!endpoint) {
          socket.send(JSON.stringify({ type: "error", message: "missing endpoint" }));
          socket.close(1008, "missing endpoint");
          return;
        }
        subscriptions.subscribe(endpoint, socket);
        socket.send(
          JSON.stringify({
            type: "subscribed",
            endpoint,
          }),
        );
      },
      message(socket) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "incoming messages are not supported",
          }),
        );
      },
      close(socket) {
        const endpoint = socket.data?.endpoint;
        if (endpoint) {
          subscriptions.unsubscribe(endpoint, socket);
        } else {
          subscriptions.clear(socket);
        }
      },
    },
  });
}

if (import.meta.main) {
  const server = startServer();
  console.log(`Tribute Pay webhook listening on http://localhost:${server.port}`);
}
