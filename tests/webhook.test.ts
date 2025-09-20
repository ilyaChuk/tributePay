import { describe, expect, test } from "bun:test";
import { createWebhookHandler } from "../src/webhook";
import { bytesToHex, computeHmacSha256 } from "../src/signature";

const encoder = new TextEncoder();

describe("createWebhookHandler", () => {
  test("returns 200 for valid signature", async () => {
    const secret = "sign-secret";
    const handler = createWebhookHandler({ secret });

    const payload = { name: "payment_completed", payload: { payment_id: "pay_007" } };
    const body = JSON.stringify(payload);
    const signatureBytes = await computeHmacSha256(secret, encoder.encode(body));
    const signatureHex = bytesToHex(signatureBytes);

    const request = new Request("http://localhost/wh", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "trbt-signature": signatureHex,
      },
    });

    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args);

    try {
      const response = await handler(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ ok: true, event: "payment_completed", paymentId: "pay_007" });
      const logged = logs.flat().some((item) => typeof item === "string" && item.includes("pay_007"));
      expect(logged).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test("rejects invalid signature", async () => {
    const handler = createWebhookHandler({ secret: "pair" });
    const payload = { name: "payment_completed", payload: { payment_id: "bad" } };
    const body = JSON.stringify(payload);

    const request = new Request("http://localhost/wh", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "trbt-signature": "deadbeef",
      },
    });

    const originalWarn = console.warn;
    console.warn = () => {};

    let response: Response;
    try {
      response = await handler(request);
    } finally {
      console.warn = originalWarn;
    }

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toEqual({ error: "invalid signature" });
  });
});
