const PDF = Buffer.from("%PDF");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF = Buffer.from("RIFF");
const WEBP = Buffer.from("WEBP");

export function sniffDocument(bytes: Buffer, claimed: string) {
  if (claimed === "application/pdf" && bytes.subarray(0, 4).equals(PDF)) return "application/pdf";
  if (claimed === "image/png" && bytes.subarray(0, 4).equals(PNG)) return "image/png";
  if (claimed === "image/jpeg" && bytes.subarray(0, 3).equals(JPEG)) return "image/jpeg";
  if (
    claimed === "image/webp" &&
    bytes.subarray(0, 4).equals(RIFF) &&
    bytes.subarray(8, 12).equals(WEBP)
  ) {
    return "image/webp";
  }
  return null;
}

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
