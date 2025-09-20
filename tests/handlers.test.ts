import { describe, expect, test } from "bun:test";
import { handleTributeEvent } from "../src/handlers";

const paymentEvent = {
  name: "payment_completed",
  payload: {
    payment_id: "pay_42",
  },
};

describe("handleTributeEvent", () => {
  test("logs payment id for completed payments", () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;

    console.log = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      const result = handleTributeEvent(paymentEvent);
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: true, event: "payment_completed", paymentId: "pay_42" });
      const logged = logs.flat().some((item) => typeof item === "string" && item.includes("pay_42"));
      expect(logged).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test("returns generic response for unknown events", () => {
    const originalLog = console.log;
    console.log = () => {};

    try {
      const result = handleTributeEvent({ name: "unknown", payload: {} });
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: true, received: "unknown" });
    } finally {
      console.log = originalLog;
    }
  });
});
