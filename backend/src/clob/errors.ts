import type { ClobErrorCode } from "./types.js";

export class ClobError extends Error {
  readonly code: ClobErrorCode;

  constructor(code: ClobErrorCode, message: string) {
    super(message);
    this.name = "ClobError";
    this.code = code;
  }
}
