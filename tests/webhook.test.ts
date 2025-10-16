import { describe, expect, test } from "bun:test";
import { createWebhookHandler } from "../src/webhook";
import { bytesToHex, computeHmacSha256 } from "../src/signature";

const encoder = new TextEncoder();
const noop: (...args: unknown[]) => void = () => {};

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
    const originalInfo = console.info;
    console.log = (...args: unknown[]) => logs.push(args);
    console.info = noop;

    try {
      const response = await handler(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ ok: true, event: "payment_completed", paymentId: "pay_007" });
      const logged = logs.flat().some((item) => typeof item === "string" && item.includes("pay_007"));
      expect(logged).toBe(true);
    } finally {
      console.log = originalLog;
      console.info = originalInfo;
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
    const originalInfo = console.info;
    console.warn = noop;
    console.info = noop;

    let response: Response;
    try {
      response = await handler(request);
    } finally {
      console.warn = originalWarn;
      console.info = originalInfo;
    }

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toEqual({ error: "invalid signature" });
  });

  test("rejects missing signature header", async () => {
    const handler = createWebhookHandler({ secret: "pair" });
    const payload = { name: "payment_completed", payload: { payment_id: "missing" } };
    const body = JSON.stringify(payload);

    const request = new Request("http://localhost/wh", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
      },
    });

    const originalWarn = console.warn;
    const originalInfo = console.info;
    console.warn = noop;
    console.info = noop;

    try {
      const response = await handler(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: "missing signature" });
    } finally {
      console.warn = originalWarn;
      console.info = originalInfo;
    }
  });

  test("rejects empty body", async () => {
    const handler = createWebhookHandler({ secret: "pair" });
    const request = new Request("http://localhost/wh", {
      method: "POST",
      body: "",
      headers: {
        "content-type": "application/json",
        "trbt-signature": "whatever",
      },
    });

    const originalWarn = console.warn;
    const originalInfo = console.info;
    console.warn = noop;
    console.info = noop;

    try {
      const response = await handler(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: "empty body" });
    } finally {
      console.warn = originalWarn;
      console.info = originalInfo;
    }
  });

  test("rejects non-POST methods", async () => {
    const handler = createWebhookHandler({ secret: "pair" });
    const request = new Request("http://localhost/wh", {
      method: "GET",
    });

    const originalWarn = console.warn;
    const originalInfo = console.info;
    console.warn = noop;
    console.info = noop;

    try {
      const response = await handler(request);
      expect(response.status).toBe(405);
      const json = await response.json();
      expect(json).toEqual({ error: "method not allowed", method: "GET" });
    } finally {
      console.warn = originalWarn;
      console.info = originalInfo;
    }
  });
});
