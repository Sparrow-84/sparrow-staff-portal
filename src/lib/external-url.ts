/** A link typed without "https://" (e.g. "murdocktrust.org/apply") is treated by the
 * browser as a page inside the staff portal, so clicking it lands back on the portal.
 * Adds the https:// so it goes to the real site. Same rule the Partnerships Directory uses. */
export function externalHref(url: string): string {
  const u = url.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return u; // already has https:, mailto:, etc.
  return `https://${u}`;
}
