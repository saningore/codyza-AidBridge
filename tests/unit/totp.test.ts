import { describe, expect, it } from "vitest";
import { demoMfa } from "../../db/ids";
import { currentTotp, newMfaSecret, verifyTotp } from "../../lib/totp";

describe("totp", () => {
  it("accepts the current demo code with or without spaces", () => {
    const code = currentTotp(demoMfa.june);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(demoMfa.june, code)).toBe(true);
    expect(verifyTotp(demoMfa.june, `${code.slice(0, 3)} ${code.slice(3)}`)).toBe(true);
    expect(verifyTotp(demoMfa.june, "000000")).toBe(false);
    expect(verifyTotp(demoMfa.andre, code)).toBe(false);
  });

  it("can verify a freshly created secret", () => {
    const secret = newMfaSecret();
    expect(verifyTotp(secret, currentTotp(secret))).toBe(true);
  });
});
