import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function newSecretToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256(raw) };
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function signFile(id: string, expiresAt: number) {
  const key = process.env.FILE_SIGNING_KEY || "dev-file-key";
  const payload = `${id}.${expiresAt}`;
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyFileSignature(token: string, id: string) {
  const [tokenId, expires, signature] = token.split(".");
  if (!tokenId || !expires || !signature || tokenId !== id) return false;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const key = process.env.FILE_SIGNING_KEY || "dev-file-key";
  const expected = createHmac("sha256", key).update(`${tokenId}.${expires}`).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
