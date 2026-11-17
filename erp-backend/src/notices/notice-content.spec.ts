import { noticeText, sanitizeNoticeContent } from './notice-content.js';

describe('notice content', () => {
  it('removes script and style together with what they contain', () => {
    expect(
      sanitizeNoticeContent(
        '<p>Hello</p><script>alert(1)</script><style>p{color:red}</style><p>there</p>',
      ),
    ).toBe('<p>Hello</p><p>there</p>');
  });

  it('keeps the allowed tags and drops every other tag but not its text', () => {
    expect(
      sanitizeNoticeContent(
        '<h1>Trip</h1><p><strong>Bring</strong> <em>lunch</em> <s>and</s> <u>water</u></p><ul><li>one</li></ul><ol><li>two</li></ol><blockquote>q</blockquote><pre><code>x</code></pre><hr><div>box</div><img src="x.png">',
      ),
    ).toBe(
      '<h1>Trip</h1><p><strong>Bring</strong> <em>lunch</em> <s>and</s> water</p><ul><li>one</li></ul><ol><li>two</li></ol><blockquote>q</blockquote><pre><code>x</code></pre><hr />box',
    );
  });

  it('drops every attribute except a safe href on a link', () => {
    expect(
      sanitizeNoticeContent(
        '<p class="x" style="color:red" onclick="steal()">Hi</p><a href="https://school.test/a" title="t" target="_blank">site</a>',
      ),
    ).toBe('<p>Hi</p><a href="https://school.test/a">site</a>');
  });

  it.each([
    ['https://school.test', true],
    ['http://school.test', true],
    ['mailto:office@school.test', true],
    ['/notices/1', true],
    ['#top', true],
    ['javascript:alert(1)', false],
    ['JaVaScRiPt:alert(1)', false],
    ['data:text/html;base64,PHNjcmlwdD4=', false],
    ['//evil.test/x', false],
    ['vbscript:x', false],
  ])('a link to %s keeps its href: %s', (href, kept) => {
    const html = sanitizeNoticeContent(`<a href="${href}">link</a>`);
    expect(html).toBe(kept ? `<a href="${href}">link</a>` : '<a>link</a>');
  });

  it('turns plain text into paragraphs and line breaks, escaped, with no Markdown', () => {
    expect(
      sanitizeNoticeContent(
        'Dear families,\r\nschool closes at 1 pm.\n\n\n**Bring** "a" & b > c\n',
      ),
    ).toBe(
      '<p>Dear families,<br />school closes at 1 pm.</p><p>**Bring** "a" &amp; b &gt; c</p>',
    );
  });

  it('content with a "<" in it is read as HTML, as in the reference', () => {
    expect(sanitizeNoticeContent('Marks <b>up</b> & <x-y>z</x-y>')).toBe(
      'Marks up &amp; z',
    );
  });

  it('gives the email text without markup', () => {
    expect(
      noticeText(
        '<h1>Trip</h1><p>Bring <strong>lunch</strong> &amp; water<br />Thanks</p><ul><li>one</li></ul>',
      ),
    ).toBe('Trip\nBring lunch & water\nThanks\none');
  });
});
