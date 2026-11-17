import sanitizeHtml from 'sanitize-html';

// The tags a notice may keep (reference NoticeContentSanitizer).
export const NOTICE_TAGS = [
  'p',
  'strong',
  'em',
  's',
  'h1',
  'h2',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'hr',
  'br',
];

// A link may point to a web page, an email address, a path on this site or
// a place on the page; nothing else (javascript:, data:, //host).
const SAFE_HREF = /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i;

// What a notice is stored as: only the allowed tags, no attributes but a
// safe href on links, and no script or style (their contents go too).
// Plain text (no "<") becomes paragraphs and line breaks.
export function sanitizeNoticeContent(content: string): string {
  const html = content.includes('<') ? content : plainTextToHtml(content);
  return sanitizeHtml(html, {
    allowedTags: NOTICE_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option'],
    transformTags: {
      a: (_tagName, attribs) => {
        const href = (attribs.href ?? '').trim();
        const kept: sanitizeHtml.Attributes = {};
        if (SAFE_HREF.test(href)) kept.href = href;
        return { tagName: 'a', attribs: kept };
      },
    },
  }).trim();
}

// The words of a notice, without any markup (the email's text).
export function noticeText(content: string): string {
  return sanitizeHtml(
    content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h1|h2|blockquote|pre)>/gi, '$&\n'),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plainTextToHtml(text: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
