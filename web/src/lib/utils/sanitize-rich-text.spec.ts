import { describe, expect, it } from 'vitest';
import { sanitizeRichText } from './sanitize-rich-text';

describe('sanitizeRichText', () => {
  it('keeps supported formatting and safe links', () => {
    expect(sanitizeRichText('<p><strong>Hello</strong> <a href="https://example.com">world</a></p>')).toBe(
      '<p><strong>Hello</strong> <a href="https://example.com" rel="noopener noreferrer">world</a></p>',
    );
  });

  it('removes executable markup and unsafe links', () => {
    expect(sanitizeRichText('<img src=x onerror=alert(1)><a href="javascript:alert(1)">no</a><script>bad()</script>')).toBe(
      '<a>no</a>bad()',
    );
  });
});
