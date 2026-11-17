import { detectFileType } from './file-type.js';

const bytes = (...values: number[]) => Buffer.from(values);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0);
const GIF = Buffer.from('GIF89a\x01\x00', 'latin1');
const PDF = Buffer.from('%PDF-1.7\n', 'latin1');
const DOC = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0);
const zip = (...names: string[]) =>
  Buffer.concat([
    bytes(0x50, 0x4b, 0x03, 0x04),
    Buffer.from(names.join('\0'), 'latin1'),
  ]);
const DOCX = zip('[Content_Types].xml', 'word/document.xml');
const ALL = ['jpg', 'png', 'gif', 'pdf', 'doc', 'docx'] as const;

describe('detectFileType', () => {
  it.each([
    ['jpg', JPG, 'image/jpeg'],
    ['png', PNG, 'image/png'],
    ['gif', GIF, 'image/gif'],
    ['pdf', PDF, 'application/pdf'],
    ['doc', DOC, 'application/msword'],
    [
      'docx',
      DOCX,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  ])('recognises %s by its first bytes', (extension, content, mime) => {
    expect(detectFileType(content, ALL)).toEqual({ extension, mime });
  });

  it('a photo or logo still accepts only jpg and png', () => {
    expect(detectFileType(JPG)?.extension).toBe('jpg');
    expect(detectFileType(PNG)?.extension).toBe('png');
    for (const other of [GIF, PDF, DOC, DOCX]) {
      expect(detectFileType(other)).toBeNull();
    }
  });

  it('a zip that is not a Word document, text and empty files are refused', () => {
    expect(detectFileType(zip('other/file.txt'), ALL)).toBeNull();
    expect(detectFileType(zip('word/document.xml'), ALL)).toBeNull();
    expect(detectFileType(Buffer.from('<html>pdf</html>'), ALL)).toBeNull();
    expect(detectFileType(Buffer.alloc(0), ALL)).toBeNull();
  });

  it('the declared name never matters, only the content', () => {
    expect(detectFileType(Buffer.from('MZ\x90\x00', 'latin1'), ALL)).toBeNull();
  });
});
