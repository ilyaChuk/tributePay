import { describe, expect, test } from "bun:test";
import { bytesToHex, computeHmacSha256 } from "../src/signature";

const encoder = new TextEncoder();
const noop: (...args: unknown[]) => void = () => {};

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete Bun.env[key];
  } else {
    Bun.env[key] = value;
  }
}

describe("server webhook routing", () => {
  test("routes requests using per-path secrets", async () => {
    const originalPort = Bun.env.PORT;
    const originalDefaultSecret = Bun.env.TRIBUTE_API_KEY;
    const originalMap = Bun.env.TRIBUTE_SECRET_MAP;

    Bun.env.PORT = "0";
    Bun.env.TRIBUTE_API_KEY = "default-secret";
    Bun.env.TRIBUTE_SECRET_MAP = JSON.stringify({ wheka: "secret-wheka" });

    const originalInfo = console.info;
    const originalWarn = console.warn;
    console.info = noop;
    console.warn = noop;

    const { startServer } = await import("../src/server");
    const server = startServer();

    try {
      const port = server.port;
      const baseUrl = `http://127.0.0.1:${port}`;

      const perPathPayload = {
        name: "payment_completed",
        payload: { payment_id: "wheka-pay" },
      };
      const perPathBody = JSON.stringify(perPathPayload);
      const perPathSignature = bytesToHex(
        await computeHmacSha256("secret-wheka", encoder.encode(perPathBody)),
      );
      const websocket = new WebSocket(`ws://127.0.0.1:${port}/ws?endpoint=wheka`);
      const messages: unknown[] = [];
      const events: unknown[] = [];

      const createAwaiter = <T>(expectedType: string, timeoutMs = 2000) => {
        let settled = false;
        let resolveFn!: (value: T) => void;
        let rejectFn!: (error: Error) => void;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            rejectFn(new Error(`timeout waiting for ${expectedType}`));
          }
        }, timeoutMs);

        const promise = new Promise<T>((resolve, reject) => {
          resolveFn = resolve;
          rejectFn = reject;
        });

        return {
          promise,
          resolve(value: T) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolveFn(value);
          },
          reject(error: Error) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            rejectFn(error);
          },
        };
      };

      const subscribedAwaiter = createAwaiter<void>("subscribed");
      const eventAwaiter = createAwaiter<any>("event");

      const handleMessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data as string);
          messages.push(parsed);
          if (parsed.type === "subscribed") {
            subscribedAwaiter.resolve();
          } else if (parsed.type === "event") {
            events.push(parsed);
            eventAwaiter.resolve(parsed);
          }
        } catch {
          // ignore malformed messages
        }
      };

      const handleClose = () => {
        const error = new Error("websocket closed");
        subscribedAwaiter.reject(error);
        eventAwaiter.reject(error);
      };

      const handleError = () => {
        const error = new Error("websocket error");
        subscribedAwaiter.reject(error);
        eventAwaiter.reject(error);
      };

      websocket.addEventListener("message", handleMessage as EventListener);
      websocket.addEventListener("close", handleClose as EventListener);
      websocket.addEventListener("error", handleError as EventListener);

      await subscribedAwaiter.promise;

      const perPathResponse = await fetch(`${baseUrl}/wheka`, {
        method: "POST",
        body: perPathBody,
        headers: {
          "content-type": "application/json",
          "trbt-signature": perPathSignature,
        },
      });
      expect(perPathResponse.status).toBe(200);

      const eventMessage = await eventAwaiter.promise;
      expect(eventMessage.endpoint).toBe("/wheka");
      expect(eventMessage.event).toMatchObject(perPathPayload);
      expect(eventMessage.metadata.status).toBe(200);

      const defaultPayload = {
        name: "payment_completed",
        payload: { payment_id: "default-pay" },
      };
      const defaultBody = JSON.stringify(defaultPayload);
      const defaultSignature = bytesToHex(
        await computeHmacSha256("default-secret", encoder.encode(defaultBody)),
      );
      const defaultResponse = await fetch(`${baseUrl}/wh`, {
        method: "POST",
        body: defaultBody,
        headers: {
          "content-type": "application/json",
          "trbt-signature": defaultSignature,
        },
      });
      expect(defaultResponse.status).toBe(200);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, 150);

        const handleMessage = (event: MessageEvent) => {
          try {
            const parsed = JSON.parse(event.data as string);
            if (parsed.type === "event") {
              cleanup();
              reject(new Error("unexpected event for different endpoint"));
            }
          } catch {
            // ignore parse errors
          }
        };

        const handleClose = () => {
          cleanup();
          reject(new Error("websocket closed before quiet period completed"));
        };

        const cleanup = () => {
          clearTimeout(timer);
          websocket.removeEventListener("message", handleMessage as EventListener);
          websocket.removeEventListener("close", handleClose as EventListener);
        };

        websocket.addEventListener("message", handleMessage as EventListener);
        websocket.addEventListener("close", handleClose as EventListener);
      });
      expect(events).toHaveLength(1);

      const wrongSignatureResponse = await fetch(`${baseUrl}/wheka`, {
        method: "POST",
        body: perPathBody,
        headers: {
          "content-type": "application/json",
          "trbt-signature": defaultSignature,
        },
      });
      expect(wrongSignatureResponse.status).toBe(401);

      const unknownResponse = await fetch(`${baseUrl}/not-configured`, {
        method: "POST",
      });
      expect(unknownResponse.status).toBe(404);

      websocket.close();
    } finally {
      server.stop(true);
      console.info = originalInfo;
      console.warn = originalWarn;
      restoreEnv("PORT", originalPort);
      restoreEnv("TRIBUTE_API_KEY", originalDefaultSecret);
      restoreEnv("TRIBUTE_SECRET_MAP", originalMap);
    }
  });
});
