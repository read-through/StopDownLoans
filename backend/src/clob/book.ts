import { getAvailableForMatching, type ClobOrder, type Hex, type OrderSide, type Outcome } from "./types.js";

export type BookKey = {
  outcomeToken: Hex;
  marketId: Hex;
  outcome: Outcome;
};

export type L2PriceLevel = {
  priceUnits: bigint;
  totalRemainingOutcomeAmount: bigint;
};

export type L2BookSnapshot = {
  key: BookKey;
  bids: L2PriceLevel[];
  asks: L2PriceLevel[];
};

type OrderQueueEntry = {
  orderHash: Hex;
  availableOutcomeAmount: bigint;
  acceptedSequence: bigint;
};

type PriceLevel = {
  priceUnits: bigint;
  totalRemainingOutcomeAmount: bigint;
  orders: OrderQueueEntry[];
};

export class InMemoryOrderBook {
  readonly key: BookKey;
  private readonly bids = new Map<string, PriceLevel>();
  private readonly asks = new Map<string, PriceLevel>();

  constructor(key: BookKey) {
    this.key = key;
  }

  static fromOrders(key: BookKey, orders: ClobOrder[]): InMemoryOrderBook {
    const book = new InMemoryOrderBook(key);

    for (const order of orders) {
      book.addOrder(order);
    }

    return book;
  }

  addOrder(order: ClobOrder): void {
    this.assertOrderBelongsToBook(order);

    if (order.status !== "LIVE") {
      return;
    }

    const available = getAvailableForMatching(order);
    if (available <= 0n) {
      return;
    }

    const level = this.getOrCreateLevel(order.side, getOrderPriceUnits(order));
    level.totalRemainingOutcomeAmount += available;
    level.orders.push({
      orderHash: order.orderHash,
      availableOutcomeAmount: available,
      acceptedSequence: order.acceptedSequence,
    });
    level.orders.sort(compareQueueEntries);
  }

  removeOrder(orderHash: Hex): void {
    this.removeOrderFromSide(this.bids, orderHash);
    this.removeOrderFromSide(this.asks, orderHash);
  }

  snapshot(): L2BookSnapshot {
    return {
      key: this.key,
      bids: toSortedLevels(this.bids, "BUY"),
      asks: toSortedLevels(this.asks, "SELL"),
    };
  }

  private assertOrderBelongsToBook(order: ClobOrder): void {
    if (
      order.outcomeToken.toLowerCase() !== this.key.outcomeToken.toLowerCase() ||
      order.marketId.toLowerCase() !== this.key.marketId.toLowerCase() ||
      order.outcome !== this.key.outcome
    ) {
      throw new Error(`Order does not belong to book: ${order.orderHash}`);
    }
  }

  private getOrCreateLevel(side: OrderSide, priceUnits: bigint): PriceLevel {
    const levels = side === "BUY" ? this.bids : this.asks;
    const key = priceUnits.toString();
    const existing = levels.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const level: PriceLevel = {
      priceUnits,
      totalRemainingOutcomeAmount: 0n,
      orders: [],
    };
    levels.set(key, level);
    return level;
  }

  private removeOrderFromSide(levels: Map<string, PriceLevel>, orderHash: Hex): void {
    for (const [priceKey, level] of levels) {
      const index = level.orders.findIndex((entry) => entry.orderHash === orderHash);
      if (index === -1) {
        continue;
      }

      const [removed] = level.orders.splice(index, 1);
      level.totalRemainingOutcomeAmount -= removed.availableOutcomeAmount;

      if (level.totalRemainingOutcomeAmount === 0n) {
        levels.delete(priceKey);
      }

      return;
    }
  }
}

export function getOrderPriceUnits(order: Pick<ClobOrder, "usdcAmount" | "outcomeAmount">): bigint {
  return (order.usdcAmount * 1_000_000n) / order.outcomeAmount;
}

function compareQueueEntries(left: OrderQueueEntry, right: OrderQueueEntry): number {
  if (left.acceptedSequence < right.acceptedSequence) {
    return -1;
  }

  if (left.acceptedSequence > right.acceptedSequence) {
    return 1;
  }

  return 0;
}

function toSortedLevels(levels: Map<string, PriceLevel>, side: OrderSide): L2PriceLevel[] {
  return [...levels.values()]
    .sort((left, right) => comparePriceLevels(left, right, side))
    .map((level) => ({
      priceUnits: level.priceUnits,
      totalRemainingOutcomeAmount: level.totalRemainingOutcomeAmount,
    }));
}

function comparePriceLevels(left: PriceLevel, right: PriceLevel, side: OrderSide): number {
  if (left.priceUnits === right.priceUnits) {
    return 0;
  }

  if (side === "BUY") {
    return left.priceUnits > right.priceUnits ? -1 : 1;
  }

  return left.priceUnits < right.priceUnits ? -1 : 1;
}
