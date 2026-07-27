import { clobApiUrl } from "./api";

type Outcome = "YES" | "NO";
type FeedStatus = "connecting" | "connected" | "disconnected" | "error";

type BookFeedMessage =
  | { type: "book_snapshot" | "book_delta" | "best_bid_ask" | "trade" }
  | { type: "error"; error?: { message?: string } };

export function subscribeBookFeed(params: {
  outcomeToken: string;
  marketId: string;
  outcome: Outcome;
  onUpdate: () => void;
  onStatus: (status: FeedStatus, error?: string) => void;
}): () => void {
  let closed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;

  const connect = () => {
    if (closed) {
      return;
    }

    params.onStatus("connecting");
    socket = new WebSocket(getClobWsUrl());

    socket.addEventListener("open", () => {
      params.onStatus("connected");
      socket?.send(
        JSON.stringify({
          type: "subscribe",
          outcomeToken: params.outcomeToken,
          marketId: params.marketId,
          outcome: params.outcome,
        })
      );
    });

    socket.addEventListener("message", (event) => {
      const message = parseFeedMessage(event.data);
      if (message.type === "error") {
        params.onStatus("error", message.error?.message ?? "WebSocket feed error.");
        return;
      }

      params.onUpdate();
    });

    socket.addEventListener("error", () => {
      params.onStatus("error", "WebSocket connection failed.");
    });

    socket.addEventListener("close", () => {
      if (closed) {
        params.onStatus("disconnected");
        return;
      }

      params.onStatus("connecting");
      reconnectTimer = window.setTimeout(connect, 1500);
    });
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
    }
    socket?.close();
  };
}

function getClobWsUrl(): string {
  const explicit = import.meta.env.VITE_CLOB_WS_URL as string | undefined;
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  const url = new URL(clobApiUrl, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/v1/ws";
  url.search = "";
  return url.toString();
}

function parseFeedMessage(raw: unknown): BookFeedMessage {
  if (typeof raw !== "string") {
    return { type: "error", error: { message: "WebSocket message must be text." } };
  }

  try {
    const parsed = JSON.parse(raw) as BookFeedMessage;
    if (
      parsed.type === "book_snapshot" ||
      parsed.type === "book_delta" ||
      parsed.type === "best_bid_ask" ||
      parsed.type === "trade" ||
      parsed.type === "error"
    ) {
      return parsed;
    }
  } catch {
    return { type: "error", error: { message: "WebSocket message must be valid JSON." } };
  }

  return { type: "error", error: { message: "Unsupported WebSocket message type." } };
}
