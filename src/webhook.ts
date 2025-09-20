import { json } from "./http";
import { handleTributeEvent } from "./handlers";
import { verifyTributeSignature } from "./signature";
import type { TributeEvent } from "./types";

export type WebhookConfig = {
  secret: string;
};

const decoder = new TextDecoder();

export function createWebhookHandler(config: WebhookConfig) {
  const { secret } = config;

  return async function handleWebhook(req: Request): Promise<Response> {
    try {
      const arrayBuffer = await req.arrayBuffer();
      const raw = new Uint8Array(arrayBuffer);

      if (!secret) {
        console.warn("Attempted to process webhook without TRIBUTE_API_KEY");
        return json({ error: "server not configured" }, 500);
      }

      const signature =
        req.headers.get("trbt-signature") ??
        req.headers.get("Trbt-Signature") ??
        req.headers.get("X-Trbt-Signature");

      const isValid = await verifyTributeSignature(signature, secret, raw);
      if (!isValid) {
        console.warn("Invalid tribute signature", signature ?? "<missing>");
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
        return json({ error: "invalid event" }, 400);
      }

      const result = handleTributeEvent(event);
      return json(result.body, { status: result.status });
    } catch (error) {
      console.error("Unhandled tribute webhook error", error);
      return json({ error: "internal error" }, 500);
    }
  };
}
