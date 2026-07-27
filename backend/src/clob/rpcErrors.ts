export function isRpcRateLimitError(error: unknown): boolean {
  const message = formatRpcErrorMessage(error).toLowerCase();
  return (
    message.includes("request limit reached") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    (message.includes("http request failed") && message.includes("429"))
  );
}

export function isRetryableRpcError(error: unknown): boolean {
  const message = formatRpcErrorMessage(error).toLowerCase();
  return isRpcRateLimitError(error) || message.includes("fetch failed") || message.includes("timeout");
}

export function formatRpcErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
