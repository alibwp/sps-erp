// File types recognised by their first bytes, never by name or the type
// the client declares. Later stages add the types they accept.
export type DetectedFileType =
  | { mime: 'image/jpeg'; extension: 'jpg' }
  | { mime: 'image/png'; extension: 'png' }
  | { mime: 'image/gif'; extension: 'gif' }
  | { mime: 'application/pdf'; extension: 'pdf' }
  | { mime: 'application/msword'; extension: 'doc' }
  | {
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      extension: 'docx';
    };

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
// The compound file of Word 97–2003 (.doc).
const OLE2_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const startsWith = (content: Buffer, signature: Buffer | string) =>
  content
    .subarray(0, signature.length)
    .equals(
      typeof signature === 'string'
        ? Buffer.from(signature, 'latin1')
        : signature,
    );

export type FileExtension = DetectedFileType['extension'];

// The type of the content when it is one of the accepted ones (by default
// the images a photo or logo may be).
export function detectFileType(
  content: Buffer,
  accepted: readonly FileExtension[] = ['jpg', 'png'],
): DetectedFileType | null {
  const type = recognise(content);
  return type && accepted.includes(type.extension) ? type : null;
}

function recognise(content: Buffer): DetectedFileType | null {
  if (
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  ) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (startsWith(content, PNG_SIGNATURE)) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (startsWith(content, 'GIF87a') || startsWith(content, 'GIF89a')) {
    return { mime: 'image/gif', extension: 'gif' };
  }
  if (startsWith(content, '%PDF-')) {
    return { mime: 'application/pdf', extension: 'pdf' };
  }
  if (startsWith(content, OLE2_SIGNATURE)) {
    return { mime: 'application/msword', extension: 'doc' };
  }
  // A .docx is a zip whose parts include the Word document.
  if (
    startsWith(content, ZIP_SIGNATURE) &&
    content.includes(Buffer.from('word/', 'latin1')) &&
    content.includes(Buffer.from('[Content_Types].xml', 'latin1'))
  ) {
    return {
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
    };
  }
  return null;
}
