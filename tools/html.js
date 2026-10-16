// Small helpers for filling HTML templates at build time.
export const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Replaces every occurrence of marker. Uses split/join, not String.replace, so "$&" in the value stays literal.
export function fill(template, marker, value) {
  if (!template.includes(marker)) throw new Error(`the template is missing ${marker}`);
  return template.split(marker).join(value);
}
