import { describe, expect, it } from "vitest";
import { MAX_DOCUMENT_BYTES, sniffDocument } from "../../lib/files";

function webp() {
  const bytes = Buffer.alloc(12);
  Buffer.from("RIFF").copy(bytes, 0);
  Buffer.from("WEBP").copy(bytes, 8);
  return bytes;
}

describe("sniffDocument", () => {
  it("accepts a file whose bytes match the claimed type", () => {
    expect(sniffDocument(Buffer.from("%PDF-1.4"), "application/pdf")).toBe("application/pdf");
    expect(sniffDocument(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]), "image/png")).toBe("image/png");
    expect(sniffDocument(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe("image/jpeg");
    expect(sniffDocument(webp(), "image/webp")).toBe("image/webp");
  });

  it("rejects a mismatched or unknown type", () => {
    expect(sniffDocument(Buffer.from("%PDF-1.4"), "image/png")).toBeNull();
    expect(sniffDocument(Buffer.from("hello"), "application/pdf")).toBeNull();
    expect(sniffDocument(Buffer.from("RIFF"), "image/webp")).toBeNull();
    expect(sniffDocument(Buffer.from("GIF89a"), "image/gif")).toBeNull();
  });

  it("caps uploads at 10 MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});
