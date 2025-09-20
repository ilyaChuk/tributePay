import type { PaymentCompletedPayload, TributeEvent } from "./types";

export type HandlerResult = {
  status: number;
  body: unknown;
};

const PAYMENT_COMPLETED_EVENTS = new Set([
  "payment.completed",
  "payment_completed",
  "payment_succeeded",
]);

function extractPaymentId(payload: PaymentCompletedPayload | undefined): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload.payment_id === "string" && payload.payment_id.length > 0) {
    return payload.payment_id;
  }

  if (typeof payload.id === "string" && payload.id.length > 0) {
    return payload.id;
  }

  return null;
}

function handlePaymentCompleted(event: TributeEvent<PaymentCompletedPayload>): HandlerResult {
  const paymentId = extractPaymentId(event.payload);

  if (paymentId) {
    console.log(`Tribute payment completed: ${paymentId}`);
  } else {
    console.warn("Payment completed event missing payment_id", event.payload);
  }

  return {
    status: 200,
    body: {
      ok: true,
      event: event.name,
      paymentId: paymentId ?? null,
    },
  };
}

function handleNewDigitalProduct(event: TributeEvent): HandlerResult {
  console.log("handleNewDigitalProduct payload:", event.payload);

  return {
    status: 200,
    body: { ok: true },
  };
}

export function handleTributeEvent(event: TributeEvent): HandlerResult {
  if (PAYMENT_COMPLETED_EVENTS.has(event.name)) {
    return handlePaymentCompleted(event as TributeEvent<PaymentCompletedPayload>);
  }

  if (event.name === "new_digital_product") {
    return handleNewDigitalProduct(event);
  }

  console.log("Unhandled tribute event", event.name);

  return {
    status: 200,
    body: {
      ok: true,
      received: event.name,
    },
  };
}
