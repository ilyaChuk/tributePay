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

      const perPathPayload = {
        name: "payment_completed",
        payload: { payment_id: "wheka-pay" },
      };
      const perPathBody = JSON.stringify(perPathPayload);
      const perPathSignature = bytesToHex(
        await computeHmacSha256("secret-wheka", encoder.encode(perPathBody)),
      );
      const perPathResponse = await fetch(`${baseUrl}/wheka`, {
        method: "POST",
        body: perPathBody,
        headers: {
          "content-type": "application/json",
          "trbt-signature": perPathSignature,
        },
      });
      expect(perPathResponse.status).toBe(200);

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
