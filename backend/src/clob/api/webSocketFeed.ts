import type { Server as HttpServer } from "node:http";
import { getAddress } from "viem";
import { WebSocketServer, type WebSocket } from "ws";
import type { Hex, Outcome } from "../types.js";
import { BookFeedPublisher } from "./bookFeedPublisher.js";

export type AttachClobWebSocketFeedOptions = {
  publisher: BookFeedPublisher;
};

export type ClobWebSocketFeed = {
  close: () => Promise<void>;
  publisher: BookFeedPublisher;
};

type SubscribeMessage = {
  type: "subscribe";
  outcomeToken: Hex;
  marketId: Hex;
  outcome: Outcome;
};

export function attachClobWebSocketFeed(
  server: HttpServer,
  options: AttachClobWebSocketFeedOptions
): ClobWebSocketFeed {
  const webSocketServer = new WebSocketServer({
    server,
    path: "/v1/ws",
  });

  webSocketServer.on("connection", (socket) => {
    socket.on("message", (raw) => {
      handleMessage(socket, raw.toString(), options.publisher).catch((error) => {
        send(socket, {
          type: "error",
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Internal error.",
          },
        });
      });
    });
  });

  return {
    publisher: options.publisher,
    close: () =>
      new Promise((resolve, reject) => {
        webSocketServer.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

async function handleMessage(
  socket: WebSocket,
  raw: string,
  publisher: BookFeedPublisher
): Promise<void> {
  const message = parseSubscribeMessage(raw);
  publisher.subscribe(socket, message);
  await publisher.publishSnapshot(message);
}

function parseSubscribeMessage(raw: string): SubscribeMessage {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("WebSocket message must be valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("WebSocket message must be an object.");
  }

  const message = parsed as Record<string, unknown>;
  if (message.type !== "subscribe") {
    throw new Error("Unsupported WebSocket message type.");
  }

  return {
    type: "subscribe",
    outcomeToken: parseAddress(message.outcomeToken, "outcomeToken"),
    marketId: parseBytes32(message.marketId, "marketId"),
    outcome: parseOutcome(message.outcome),
  };
}

function parseAddress(value: unknown, fieldName: string): Hex {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${fieldName} must be an address.`);
  }

  return getAddress(value) as Hex;
}

function parseBytes32(value: unknown, fieldName: string): Hex {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${fieldName} must be bytes32.`);
  }

  return value as Hex;
}

function parseOutcome(value: unknown): Outcome {
  if (value === "YES" || value === "NO") {
    return value;
  }

  throw new Error("outcome must be YES or NO.");
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}
