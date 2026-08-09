type DecodeOptions = {
  complete?: boolean;
};

export function decode(token: string, options: DecodeOptions = {}): unknown {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = decodePart(parts[0]);
    const payload = decodePart(parts[1]);
    return options.complete ? { header, payload, signature: parts[2] } : payload;
  } catch {
    return null;
  }
}

function decodePart(value: string): unknown {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
