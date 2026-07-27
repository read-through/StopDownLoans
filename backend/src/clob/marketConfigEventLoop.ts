import { type BookFeedPublisher } from "./api/bookFeedPublisher.js";
import { withTransaction } from "./db/client.js";
import {
  getUnprocessedMarketConfigEventsForUpdate,
  markMarketConfigEventProcessed,
} from "./db/marketConfigEvents.js";
import { assertPositiveInteger } from "./loopValidation.js";

export type SweepMarketConfigEventsInput = {
  limit: number;
  bookFeedPublisher: BookFeedPublisher;
};

export async function sweepMarketConfigEvents(
  input: SweepMarketConfigEventsInput
): Promise<number> {
  assertPositiveInteger(input.limit, "Market config event sweep limit");

  return withTransaction(async (client) => {
    const events = await getUnprocessedMarketConfigEventsForUpdate(client, input.limit);

    for (const event of events) {
      if (event.eventType === "TICK_SIZE_CHANGE") {
        if (
          event.defaultTickUnits === null ||
          event.edgeTickUnits === null ||
          event.lowerEdgePriceUnits === null ||
          event.upperEdgePriceUnits === null
        ) {
          throw new Error(`Tick-size event is missing tick fields: ${event.marketConfigEventId.toString()}`);
        }

        input.bookFeedPublisher.publishTickSizeChange({
          outcomeToken: event.outcomeToken,
          marketId: event.marketId,
          defaultTickUnits: event.defaultTickUnits,
          edgeTickUnits: event.edgeTickUnits,
          lowerEdgePriceUnits: event.lowerEdgePriceUnits,
          upperEdgePriceUnits: event.upperEdgePriceUnits,
        });
      } else if (event.eventType === "MARKET_OPENED") {
        input.bookFeedPublisher.publishMarketOpened(event);
      } else {
        input.bookFeedPublisher.publishMarketClosed(event);
      }

      await markMarketConfigEventProcessed(client, event.marketConfigEventId);
    }

    return events.length;
  });
}

export function startMarketConfigEventSweepLoop(options: {
  intervalMs: number;
  sweep: () => Promise<unknown>;
  onError?: (error: unknown) => void;
}): () => void {
  assertPositiveInteger(options.intervalMs, "Market config event sweep interval");

  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    options.sweep().catch(options.onError ?? (() => {})).finally(() => {
      running = false;
    });
  }, options.intervalMs);

  return () => clearInterval(timer);
}
