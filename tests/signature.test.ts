import { describe, expect, test } from "bun:test";
import { bytesToHex, computeHmacSha256, verifyTributeSignature } from "../src/signature";

const encoder = new TextEncoder();

describe("verifyTributeSignature", () => {
  test("accepts valid hex signatures", async () => {
    const secret = "test-secret";
    const payload = encoder.encode(JSON.stringify({ hello: "world" }));
    const signature = await computeHmacSha256(secret, payload);
    const signatureHex = bytesToHex(signature);

    const verified = await verifyTributeSignature(signatureHex, secret, payload);
    const verifiedWithPrefix = await verifyTributeSignature(`sha256=${signatureHex}`, secret, payload);

    expect(verified).toBe(true);
    expect(verifiedWithPrefix).toBe(true);
  });

  test("accepts valid base64 signatures", async () => {
    const secret = "base64-secret";
    const payload = encoder.encode(JSON.stringify({ foo: "bar" }));
    const signature = await computeHmacSha256(secret, payload);
    const binary = String.fromCharCode(...signature);
    const signatureBase64 = btoa(binary);

    const verified = await verifyTributeSignature(signatureBase64, secret, payload);
    expect(verified).toBe(true);
  });

  test("rejects mismatched signatures", async () => {
    const secret = "test-secret";
    const payload = encoder.encode("payload");
    const signature = await computeHmacSha256(secret, payload);
    const signatureHex = bytesToHex(signature);

    const mismatch = await verifyTributeSignature(signatureHex, "other-secret", payload);
    const missing = await verifyTributeSignature(null, secret, payload);

    expect(mismatch).toBe(false);
    expect(missing).toBe(false);
  });
});
