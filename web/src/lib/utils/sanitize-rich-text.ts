const allowedTags = new Set(['a', 'b', 'br', 'div', 'em', 'font', 'i', 'li', 'ol', 'p', 'span', 'strong', 'u', 'ul']);

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const safeHref = (value: string) => {
  try {
    const url = new URL(value, 'https://album-description.invalid');
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
};

const safeColor = (value: string) => (/^#[0-9a-f]{3,8}$/i.test(value) ? value : undefined);

/**
 * Keep album prose intentionally small and portable: formatting and safe links,
 * with no executable attributes, embeds, or arbitrary styles.
 */
export const sanitizeRichText = (value: string) =>
  value
    .replaceAll(/<!--[^]*?-->/g, '')
    .replaceAll(/<\/?[^>]+>/g, (tag) => {
      const match = /^<(\/)?\s*([a-z0-9]+)([^>]*)>$/i.exec(tag);
      if (!match) return '';

      const [, closing, rawName, attributes] = match;
      const name = rawName.toLowerCase();
      if (!allowedTags.has(name)) return '';
      if (closing) return `</${name}>`;
      if (name === 'font') {
        const colorMatch = /\bcolor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
        const color = colorMatch && safeColor(colorMatch[1] ?? colorMatch[2] ?? colorMatch[3]);
        return color ? `<font color="${color}">` : '<font>';
      }
      if (name !== 'a') return `<${name}>`;

      const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
      const href = hrefMatch && safeHref(hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3]);
      return href ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">` : '<a>';
    });
