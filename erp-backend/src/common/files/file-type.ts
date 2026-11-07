// File types recognised by their first bytes, never by name or the type
// the client declares. Later stages add the types they accept.
export type DetectedFileType =
  | { mime: 'image/jpeg'; extension: 'jpg' }
  | { mime: 'image/png'; extension: 'png' };

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function detectFileType(content: Buffer): DetectedFileType | null {
  if (
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  ) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { mime: 'image/png', extension: 'png' };
  }
  return null;
}
