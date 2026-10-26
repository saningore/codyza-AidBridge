import { Secret, TOTP } from "otpauth";

function totp(secret: string) {
  return new TOTP({
    issuer: "AidBridge",
    label: "AidBridge",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

export function newMfaSecret() {
  return new Secret({ size: 20 }).base32;
}

export function verifyTotp(secret: string, token: string) {
  const delta = totp(secret).validate({ token: token.replace(/\s/g, ""), window: 1 });
  return delta !== null;
}

export function currentTotp(secret: string) {
  return totp(secret).generate();
}
