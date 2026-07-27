import type { PublicClient } from "viem";
import { cancelOrder } from "../orderCancellation.js";
import { submitOrderAndMatch } from "../orderSubmission.js";
import type { OutcomeExchangeDomain } from "../orderSigning.js";
import type { Hex } from "../types.js";
import { type BookFeedPublisher } from "./bookFeedPublisher.js";
import {
  toApiCancelOrderResponseDto,
  toApiSubmitOrderResponseDto,
  type ApiCancelOrderResponseDto,
  type ApiSubmitOrderResponseDto,
} from "./dto.js";
import { parseCancelOrderRequest, parseSubmitOrderRequest } from "./parsers.js";

export type ClobWriteServiceConfig = {
  domain: OutcomeExchangeDomain;
  usdc: Hex;
  outcomeExchange: Hex;
  publicClient: PublicClient;
  now: () => Date;
  bookFeedPublisher?: BookFeedPublisher;
};

export async function submitOrderRequest(
  request: unknown,
  config: ClobWriteServiceConfig
): Promise<ApiSubmitOrderResponseDto> {
  const submit = parseSubmitOrderRequest(request);
  const result = await submitOrderAndMatch({
    submit,
    domain: config.domain,
    usdc: config.usdc,
    outcomeExchange: config.outcomeExchange,
    now: config.now(),
    publicClient: config.publicClient,
  });
  await config.bookFeedPublisher?.publishBookUpdate({
    outcomeToken: result.order.outcomeToken,
    marketId: result.order.marketId,
    outcome: result.order.outcome,
  });
  if (result.trade !== null) {
    await config.bookFeedPublisher?.publishTrade(result.trade.trade);
  }

  return toApiSubmitOrderResponseDto(result);
}

export async function cancelOrderRequest(
  request: unknown,
  config: ClobWriteServiceConfig
): Promise<ApiCancelOrderResponseDto> {
  const { cancel, signature } = parseCancelOrderRequest(request);
  const result = await cancelOrder({
    cancel,
    signature,
    domain: config.domain,
    usdc: config.usdc,
    now: config.now(),
    publicClient: config.publicClient,
  });
  await config.bookFeedPublisher?.publishBookUpdate({
    outcomeToken: result.order.outcomeToken,
    marketId: result.order.marketId,
    outcome: result.order.outcome,
  });

  return toApiCancelOrderResponseDto(result);
}
