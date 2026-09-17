// Implementation: private to the publishing package.

/**
 * `&`, `<` and `>` as HTML entities, so a title with an ampersand or an angle
 * bracket in it publishes as the characters somebody typed.
 */
export function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
