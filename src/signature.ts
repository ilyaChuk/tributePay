const encoder = new TextEncoder();

function textToBytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex value must contain an even number of characters");
  }
  const length = hex.length / 2;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    const segment = hex.slice(i * 2, i * 2 + 2);
    const value = Number.parseInt(segment, 16);
    if (Number.isNaN(value)) {
      throw new Error("Hex value contains invalid characters");
    }
    bytes[i] = value;
  }
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function computeHmacSha256(secret: string, raw: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    textToBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, raw);
  return new Uint8Array(signature);
}

const HEX_PATTERN = /^[0-9a-f]+$/i;

export async function verifyTributeSignature(
  headerSignature: string | null,
  secret: string,
  rawBody: Uint8Array,
): Promise<boolean> {
  if (!headerSignature || !secret) {
    return false;
  }

  const cleanedHeader = headerSignature.replace(/^sha256=/i, "").trim();
  if (!cleanedHeader) {
    return false;
  }

  const expected = await computeHmacSha256(secret, rawBody);
  const expectedHex = bytesToHex(expected);
  const expectedBase64 = bytesToBase64(expected);

  const headerBytes = textToBytes(cleanedHeader);
  if (constantTimeEquals(headerBytes, textToBytes(expectedHex))) {
    return true;
  }
  if (constantTimeEquals(headerBytes, textToBytes(expectedBase64))) {
    return true;
  }

  if (HEX_PATTERN.test(cleanedHeader)) {
    try {
      const candidate = hexToBytes(cleanedHeader);
      if (constantTimeEquals(candidate, expected)) {
        return true;
      }
    } catch {
      // ignore parsing errors
    }
  }

  try {
    const candidate = base64ToBytes(cleanedHeader);
    if (constantTimeEquals(candidate, expected)) {
      return true;
    }
  } catch {
    // ignore parsing errors
  }

  return false;
}

export { bytesToHex, bytesToBase64, computeHmacSha256, constantTimeEquals };
