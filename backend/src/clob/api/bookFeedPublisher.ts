import type { WebSocket } from "ws";
import { getPool, type DbClient } from "../db/client.js";
import type { Hex, MarketConfig, Outcome, Trade } from "../types.js";
import {
  toApiBestBidAskDto,
  toApiBookDeltaDto,
  toApiMarketClosedDto,
  toApiMarketOpenedDto,
  toApiTickSizeChangeDto,
  toApiTradeDto,
  type ApiBookSnapshotDto,
} from "./dto.js";
import { getBookView } from "./readServices.js";

export type BookFeedKey = {
  outcomeToken: Hex;
  marketId: Hex;
  outcome: Outcome;
};

type BookSnapshotLoader = typeof getBookView;

export class BookFeedPublisher {
  private readonly subscribers = new Map<string, Set<WebSocket>>();
  private readonly sequences = new Map<string, bigint>();
  private readonly lastSnapshots = new Map<string, ApiBookSnapshotDto>();
  private readonly now: () => Date;
  private readonly loadBookSnapshot: BookSnapshotLoader;
  private readonly getDbClient: () => DbClient;

  constructor(options: { now?: () => Date; loadBookSnapshot?: BookSnapshotLoader; dbClient?: DbClient } = {}) {
    this.now = options.now ?? (() => new Date());
    this.loadBookSnapshot = options.loadBookSnapshot ?? getBookView;
    this.getDbClient = () => options.dbClient ?? getPool();
  }

  subscribe(socket: WebSocket, key: BookFeedKey): void {
    const serializedKey = serializeBookFeedKey(key);
    let subscribers = this.subscribers.get(serializedKey);

    if (subscribers === undefined) {
      subscribers = new Set();
      this.subscribers.set(serializedKey, subscribers);
    }

    subscribers.add(socket);
    socket.once("close", () => {
      subscribers?.delete(socket);
      if (subscribers?.size === 0) {
        this.subscribers.delete(serializedKey);
      }
    });
  }

  async publishSnapshot(key: BookFeedKey): Promise<void> {
    const serializedKey = serializeBookFeedKey(key);
    const subscribers = this.subscribers.get(serializedKey);
    if (subscribers === undefined || subscribers.size === 0) {
      return;
    }

    const sequence = this.nextSequence(serializedKey);
    const snapshot = await this.loadBookSnapshot(this.getDbClient(), {
      ...key,
      sequence,
      timestamp: this.now(),
    });
    this.lastSnapshots.set(serializedKey, snapshot);
    const message = JSON.stringify({
      type: "book_snapshot",
      ...snapshot,
    });

    this.sendToSubscribers(subscribers, message);
    this.sendToSubscribers(
      subscribers,
      JSON.stringify({
        type: "best_bid_ask",
        ...toApiBestBidAskDto(snapshot, {
          sequence: this.nextSequence(serializedKey),
          timestamp: this.now(),
        }),
      })
    );
  }

  async publishBookUpdate(key: BookFeedKey): Promise<void> {
    const serializedKey = serializeBookFeedKey(key);
    const subscribers = this.subscribers.get(serializedKey);
    if (subscribers === undefined || subscribers.size === 0) {
      return;
    }

    const sequence = this.nextSequence(serializedKey);
    const timestamp = this.now();
    const snapshot = await this.loadBookSnapshot(this.getDbClient(), {
      ...key,
      sequence,
      timestamp,
    });
    const previous = this.lastSnapshots.get(serializedKey);
    this.lastSnapshots.set(serializedKey, snapshot);

    const message =
      previous === undefined
        ? JSON.stringify({
            type: "book_snapshot",
            ...snapshot,
          })
        : JSON.stringify({
            type: "book_delta",
            ...toApiBookDeltaDto(previous, snapshot, {
              sequence,
              timestamp,
            }),
          });

    this.sendToSubscribers(subscribers, message);
    this.sendToSubscribers(
      subscribers,
      JSON.stringify({
        type: "best_bid_ask",
        ...toApiBestBidAskDto(snapshot, {
          sequence: this.nextSequence(serializedKey),
          timestamp: this.now(),
        }),
      })
    );
  }

  async publishTrade(trade: Trade): Promise<void> {
    const key = {
      outcomeToken: trade.outcomeToken,
      marketId: trade.marketId,
      outcome: trade.outcome,
    };
    const serializedKey = serializeBookFeedKey(key);
    const subscribers = this.subscribers.get(serializedKey);
    if (subscribers === undefined || subscribers.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: "trade",
      sequence: this.nextSequence(serializedKey).toString(),
      ...toApiTradeDto(trade),
    });

    this.sendToSubscribers(subscribers, message);
  }

  publishTickSizeChange(
    config: Pick<
      MarketConfig,
      | "outcomeToken"
      | "marketId"
      | "defaultTickUnits"
      | "edgeTickUnits"
      | "lowerEdgePriceUnits"
      | "upperEdgePriceUnits"
    >
  ): void {
    this.publishMarketEvent(config, (sequence, timestamp) => ({
      type: "tick_size_change",
      ...toApiTickSizeChangeDto(config, {
        sequence,
        timestamp,
      }),
    }));
  }

  publishMarketClosed(config: Pick<MarketConfig, "outcomeToken" | "marketId">): void {
    this.publishMarketEvent(config, (sequence, timestamp) => ({
      type: "market_closed",
      ...toApiMarketClosedDto(config, {
        sequence,
        timestamp,
      }),
    }));
  }

  publishMarketOpened(config: Pick<MarketConfig, "outcomeToken" | "marketId">): void {
    this.publishMarketEvent(config, (sequence, timestamp) => ({
      type: "market_opened",
      ...toApiMarketOpenedDto(config, {
        sequence,
        timestamp,
      }),
    }));
  }

  private nextSequence(serializedKey: string): bigint {
    const sequence = (this.sequences.get(serializedKey) ?? 0n) + 1n;
    this.sequences.set(serializedKey, sequence);
    return sequence;
  }

  private sendToSubscribers(subscribers: Set<WebSocket>, message: string): void {
    for (const socket of subscribers) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }

  private publishMarketEvent(
    config: Pick<MarketConfig, "outcomeToken" | "marketId">,
    buildMessage: (sequence: bigint, timestamp: Date) => unknown
  ): void {
    const prefix = serializeMarketFeedPrefix(config);

    for (const [serializedKey, subscribers] of this.subscribers) {
      if (!serializedKey.startsWith(prefix)) {
        continue;
      }

      this.sendToSubscribers(
        subscribers,
        JSON.stringify(buildMessage(this.nextSequence(serializedKey), this.now()))
      );
    }
  }
}

export function serializeBookFeedKey(key: BookFeedKey): string {
  return `${serializeMarketFeedPrefix(key)}${key.outcome}`;
}

function serializeMarketFeedPrefix(key: Pick<BookFeedKey, "outcomeToken" | "marketId">): string {
  return `${key.outcomeToken.toLowerCase()}:${key.marketId.toLowerCase()}:`;
}
