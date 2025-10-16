import { json } from "./http";
import { handleTributeEvent } from "./handlers";
import { verifyTributeSignature } from "./signature";
import type { TributeEvent } from "./types";

export type WebhookConfig = {
  secret: string;
  endpoint?: string;
};

const decoder = new TextDecoder();

export function createWebhookHandler(config: WebhookConfig) {
  const { secret, endpoint } = config;
  const logPrefix = (() => {
    if (!endpoint) return "[TributeWebhook]";
    return `[TributeWebhook:${endpoint}]`;
  })();

  return async function handleWebhook(req: Request): Promise<Response> {
    try {
      const method = req.method ?? "GET";
      const url = new URL(req.url);
      console.info(`${logPrefix} received ${method} ${url.pathname}`);

      if (method !== "POST") {
        console.warn(`${logPrefix} rejecting unsupported method ${method} ${url.pathname}`);
        return json({ error: "method not allowed", method }, { status: 405 });
      }

      if (!secret) {
        console.error(
          `${logPrefix} webhook secret not configured; signature verification disabled`,
        );
        return json({ error: "server misconfigured" }, 500);
      }

      const arrayBuffer = await req.arrayBuffer();
      const raw = new Uint8Array(arrayBuffer);

      if (raw.byteLength === 0) {
        console.warn(`${logPrefix} empty request body`);
        return json({ error: "empty body" }, 400);
      }

      const signature =
        req.headers.get("trbt-signature") ??
        req.headers.get("Trbt-Signature") ??
        req.headers.get("X-Trbt-Signature");

      if (!signature) {
        console.warn(`${logPrefix} missing signature header`);
        return json({ error: "missing signature" }, 401);
      }

      const isValid = await verifyTributeSignature(signature, secret, raw);
      if (!isValid) {
        console.warn(`${logPrefix} invalid signature`, signature);
        return json({ error: "invalid signature" }, 401);
      }

      const bodyText = decoder.decode(raw);
      let event: TributeEvent | null = null;
      try {
        event = JSON.parse(bodyText) as TributeEvent;
      } catch (err) {
        console.warn("Invalid tribute payload", err);
        return json({ error: "invalid json" }, 400);
      }

      if (!event || typeof event.name !== "string") {
        console.warn(`${logPrefix} invalid event`, event);
        return json({ error: "invalid event" }, 400);
      }

      const result = handleTributeEvent(event);
      console.info(`${logPrefix} processed ${event.name} -> ${result.status}`);
      return json(result.body, { status: result.status });
    } catch (error) {
      console.error(`${logPrefix} unhandled error`, error);
      return json({ error: "internal error" }, 500);
    }
  };
}
