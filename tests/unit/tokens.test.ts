import { describe, expect, it } from "vitest";
import { newSecretToken, sha256, signFile, verifyFileSignature } from "../../lib/tokens";

const fileId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

describe("tokens", () => {
  it("stores a hash instead of the raw secret", () => {
    const token = newSecretToken();
    expect(token.raw).not.toBe(token.hash);
    expect(token.hash).toBe(sha256(token.raw));
    expect(token.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts a signature for the same file before it expires", () => {
    const token = signFile(fileId, Date.now() + 60_000);
    expect(verifyFileSignature(token, fileId)).toBe(true);
  });

  it("rejects an expired, swapped, or edited signature", () => {
    expect(verifyFileSignature(signFile(fileId, Date.now() - 1000), fileId)).toBe(false);
    expect(verifyFileSignature(signFile(fileId, Date.now() + 60_000), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1")).toBe(false);
    const [id, expires, signature] = signFile(fileId, Date.now() + 60_000).split(".");
    expect(verifyFileSignature(`${id}.${expires}.${signature.slice(0, -1)}x`, fileId)).toBe(false);
    expect(verifyFileSignature("not-a-token", fileId)).toBe(false);
    expect(verifyFileSignature("", fileId)).toBe(false);
  });
});
