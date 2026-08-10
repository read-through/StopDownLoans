export function parseUsdcInput(value: string): { value: bigint | null; error: string | null } {
  const trimmed = value.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(trimmed)) {
    return { value: null, error: "Amount must be a positive decimal with at most 6 decimals." };
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const parsed = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (parsed <= 0n) {
    return { value: null, error: "Amount must be positive." };
  }

  return { value: parsed, error: null };
}

export function parseBpsInput(value: string): { value: bigint | null; error: string | null } {
  const trimmed = value.trim();
  if (!/^(0|[1-9][0-9]*)$/.test(trimmed)) {
    return { value: null, error: "Bps must be a non-negative integer." };
  }

  return { value: BigInt(trimmed), error: null };
}

export function parseLoanDeadlineInputs(params: {
  loanWithdrawFreezeDeadline: string;
  activationDeadline: string;
  repaymentDeadline: string;
}): {
  value: {
    loanWithdrawFreezeDeadline: bigint;
    activationDeadline: bigint;
    repaymentDeadline: bigint;
  } | null;
  error: string | null;
} {
  const loanWithdrawFreezeDeadline = parseDatetimeLocalSeconds(params.loanWithdrawFreezeDeadline);
  const activationDeadline = parseDatetimeLocalSeconds(params.activationDeadline);
  const repaymentDeadline = parseDatetimeLocalSeconds(params.repaymentDeadline);

  if (loanWithdrawFreezeDeadline === null || activationDeadline === null || repaymentDeadline === null) {
    return { value: null, error: "All deadlines must be valid dates." };
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (activationDeadline <= now) {
    return { value: null, error: "Activation deadline must be in the future." };
  }
  if (loanWithdrawFreezeDeadline > activationDeadline) {
    return { value: null, error: "Withdraw freeze cannot be after activation deadline." };
  }
  if (repaymentDeadline <= activationDeadline) {
    return { value: null, error: "Repayment deadline must be after activation deadline." };
  }

  return {
    value: {
      loanWithdrawFreezeDeadline,
      activationDeadline,
      repaymentDeadline,
    },
    error: null,
  };
}

export function parseDatetimeLocalSeconds(value: string): bigint | null {
  const timestampMs = new Date(value).getTime();
  if (Number.isNaN(timestampMs)) {
    return null;
  }

  return BigInt(Math.floor(timestampMs / 1000));
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function toDatetimeLocalInput(date: Date): string {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}
