import type { ServerWebSocket } from "bun";
import { normalizeWebhookPath } from "./config";

export type SubscriptionMessage =
  | { type: "subscribed"; endpoint: string }
  | { type: "unsubscribed"; endpoint: string }
  | {
      type: "event";
      endpoint: string;
      event: unknown;
      metadata?: Record<string, unknown>;
    }
  | { type: "error"; message: string };

type Socket = ServerWebSocket<WebSocketData>;

export type WebSocketData = {
  endpoint: string | null;
};

export class SubscriptionManager {
  private channels = new Map<string, Set<Socket>>();

  subscribe(endpoint: string, socket: Socket) {
    const normalized = normalizeWebhookPath(endpoint);
    let sockets = this.channels.get(normalized);
    if (!sockets) {
      sockets = new Set();
      this.channels.set(normalized, sockets);
    }
    sockets.add(socket);
  }

  unsubscribe(endpoint: string, socket: Socket) {
    const normalized = normalizeWebhookPath(endpoint);
    const sockets = this.channels.get(normalized);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) {
      this.channels.delete(normalized);
    }
  }

  broadcast(endpoint: string, message: SubscriptionMessage) {
    const normalized = normalizeWebhookPath(endpoint);
    const sockets = this.channels.get(normalized);
    if (!sockets || sockets.size === 0) {
      return;
    }
    const serialized = JSON.stringify(message);
    for (const socket of sockets) {
      try {
        socket.send(serialized);
      } catch (error) {
        console.warn(`[TributeSubscriptions] failed to deliver to ${normalized}`, error);
      }
    }
  }

  clear(socket: Socket) {
    for (const [endpoint, sockets] of this.channels.entries()) {
      if (!sockets.has(socket)) {
        continue;
      }
      sockets.delete(socket);
      if (sockets.size === 0) {
        this.channels.delete(endpoint);
      }
    }
  }
}

