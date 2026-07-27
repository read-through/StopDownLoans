import type { Hex } from "../types.js";

export function bufferToHex(value: Buffer): Hex {
  return `0x${value.toString("hex")}`;
}

export function hexToBuffer(value: Hex): Buffer {
  return Buffer.from(value.slice(2), "hex");
}
