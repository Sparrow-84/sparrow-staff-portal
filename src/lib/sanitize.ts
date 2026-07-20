import DOMPurify from 'dompurify';

// Keeps structure (bold, italic, headings, lists, tables, quotes, links) from
// pasted content — Google Docs, a rendered Claude reply, etc. — while dropping
// the exact fonts/colors/spacing those sources bake in. The app's own CSS
// (see RichText.tsx) then styles the semantic tags consistently, in both themes.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u',
  'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'a', 'div', 'span',
];

export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href'],
  }).trim();
}
