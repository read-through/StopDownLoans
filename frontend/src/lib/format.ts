import type {
  ApiPriceLevel,
  ApiReservation,
  ApiSubmitOrderResponse,
  ApiTrade,
} from "../api";
import type { WalletStatus } from "../wallet";

export function walletButtonLabel(status: WalletStatus): string {
  if (status === "checking") {
    return "Checking wallet";
  }

  if (status === "unavailable") {
    return "No wallet";
  }

  if (status === "connecting") {
    return "Connecting";
  }

  if (status === "error") {
    return "Retry wallet";
  }

  return "Connect wallet";
}

export function formatBps(value: bigint): string {
  const whole = value / 100n;
  const fraction = value % 100n;

  if (fraction === 0n) {
    return whole.toString();
  }

  return `${whole.toString()}.${fraction.toString().padStart(2, "0").replace(/0+$/, "")}`;
}

export function formatPriceUnits(value: number): string {
  const units = 1_000_000;
  const whole = Math.trunc(value / units);
  const fraction = value % units;
  const fractionText = fraction.toString().padStart(6, "0").replace(/0+$/, "");

  return fractionText.length === 0 ? whole.toString() : `${whole.toString()}.${fractionText}`;
}

export function formatQuotePrice(level: ApiPriceLevel | null): string {
  if (level === null) {
    return "-";
  }

  return formatPriceUnits(level.priceUnits);
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function formatOptionalUsdc(value: bigint | null): string {
  return value === null ? "Not configured" : `${formatUsdc(value)} USDC`;
}

export function formatApproval(value: boolean | null): string {
  if (value === null) {
    return "Not configured";
  }

  return value ? "Approved" : "Not approved";
}

export function formatReservationAsset(reservation: ApiReservation): string {
  if (reservation.assetType === "ERC20") {
    return "Reserved USDC";
  }

  return "Reserved outcome tokens";
}

export function formatOrderSubmitOutcome(result: ApiSubmitOrderResponse): string {
  if (result.createdTradeIds.length > 0 && result.rested) {
    return result.isPartiallyFilled ? "partially filled and resting" : "matched and resting";
  }

  if (result.createdTradeIds.length > 0) {
    return result.isPartiallyFilled ? "partially filled" : "matched";
  }

  if (result.rested) {
    return "resting in book";
  }

  return result.status.toLowerCase();
}

export function formatTradePrice(trade: ApiTrade): string {
  const outcomeAmount = BigInt(trade.totalOutcomeAmount);
  if (outcomeAmount === 0n) {
    return "-";
  }

  return formatUsdc((BigInt(trade.totalUsdcAmount) * 1_000_000n) / outcomeAmount);
}

export function formatUsdc(value: bigint): string {
  const [whole, fraction] = formatUsdcInput(value).split(".");
  const wholeText = addThousandsSeparators(whole);

  return fraction === undefined ? wholeText : `${wholeText}.${fraction}`;
}

export function formatUsdcInput(value: bigint): string {
  const units = 1_000_000n;
  const whole = value / units;
  const fraction = value % units;
  const fractionText = fraction.toString().padStart(6, "0").replace(/0+$/, "");

  return fractionText.length === 0 ? whole.toString() : `${whole.toString()}.${fractionText}`;
}

export function formatTradeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatTopbarTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function formatUnixDeadline(value: string): string {
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function shortHex(value: string): string {
  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function addThousandsSeparators(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
