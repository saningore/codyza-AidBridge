import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../lib/password";

describe("passwords", () => {
  it("verifies the stored scrypt hash and rejects anything else", async () => {
    const stored = await hashPassword("Harbor-lamp-42");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Harbor-lamp-42", stored)).toBe(true);
    expect(await verifyPassword("harbor-lamp-42", stored)).toBe(false);
    expect(await verifyPassword("Harbor-lamp-42", "not-a-hash")).toBe(false);
    expect(await verifyPassword("Harbor-lamp-42", "scrypt$salt$short")).toBe(false);
    expect(await verifyPassword("Harbor-lamp-42", "bcrypt$salt$hash")).toBe(false);
  });

  it("uses a different salt for the same password", async () => {
    const first = await hashPassword("Harbor-lamp-42");
    const second = await hashPassword("Harbor-lamp-42");
    expect(first).not.toBe(second);
    expect(await verifyPassword("Harbor-lamp-42", second)).toBe(true);
  });
});
