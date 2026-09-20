/**
 * Meeting-minute content sanitization (`REQ-MTG-006`, `FE-1113`).
 *
 * The Add and Edit forms take long-form content in a plain textarea. What
 * reaches the service is therefore ordinary typed text most of the time — but
 * a paste from Word, a webmail thread or a wiki arrives as markup, and that
 * markup is untrusted. Everything a minute stores and renders passes through
 * `sanitizeMinuteContent` first, which is the only producer of
 * `SanitizedMinuteContent`.
 *
 * The rules:
 *
 * - `script`, `style`, `iframe`, `object` and `embed` lose their **content**
 *   as well as their tags. Keeping the text of a script would put the payload
 *   back on the page as visible text, which is not executable but is still the
 *   attacker's string rendered verbatim.
 * - Every other tag outside the allowlist is dropped while its text is kept,
 *   so a pasted `<span style="…">` loses the wrapper, not the sentence.
 * - Allowed tags keep no attributes at all. That removes `onclick`, `href`,
 *   `style` and `srcset` in one rule rather than by chasing a blocklist.
 * - Anything still looking like markup afterwards — a stray `<`, an `&` — is
 *   escaped, so the stored string is safe to render as HTML.
 *
 * Content that was nothing but removed markup sanitizes to an empty string.
 * The service turns that into `CONTENT_EMPTY_AFTER_SANITIZING` rather than
 * storing a blank minute (`FE-1114`).
 */

/** Tags a minute may keep. Deliberately short: no links, images or tables. */
const ALLOWED_TAGS: readonly string[] = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li'];

/** Tags whose text is dropped with them. */
const STRIPPED_WITH_CONTENT: readonly string[] = ['script', 'style', 'iframe', 'object', 'embed'];

/** Allowed tags that make the content already-structured, so it is not re-wrapped. */
const BLOCK_TAGS: readonly string[] = ['p', 'ul', 'ol', 'li'];

const VOID_TAGS: readonly string[] = ['br'];

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function removeDangerousElements(value: string): string {
  let output = value.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of STRIPPED_WITH_CONTENT) {
    // An unclosed dangerous element swallows the rest of the input on purpose:
    // there is no safe way to guess where the author meant it to end.
    output = output.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(?:</${tag}\\s*>|$)`, 'gi'), '');
  }
  return output;
}

/** Matches a well-formed tag only; a stray `<` stays in the text and is escaped. */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

function stripToAllowedTags(value: string): string {
  let output = '';
  let cursor = 0;

  for (const match of value.matchAll(TAG)) {
    const [raw, closing, rawName] = match;
    const index = match.index ?? 0;
    output += escapeText(value.slice(cursor, index));
    cursor = index + raw.length;

    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.includes(name)) continue;
    if (VOID_TAGS.includes(name)) {
      output += '<br />';
      continue;
    }
    output += closing ? `</${name}>` : `<${name}>`;
  }

  return output + escapeText(value.slice(cursor));
}

/** True when nothing but whitespace survives once the markup is removed. */
function hasVisibleText(html: string): boolean {
  return minuteContentToPlainText(html).trim().length > 0;
}

function wrapParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${block.split('\n').join('<br />')}</p>`)
    .join('');
}

/**
 * Turns raw form input into the stored, renderable content.
 *
 * Returns an empty string when nothing survives, which the caller must treat
 * as empty content rather than storing.
 */
export function sanitizeMinuteContent(raw: string): string {
  const stripped = stripToAllowedTags(removeDangerousElements(raw)).replace(/\r\n?/g, '\n');
  if (!hasVisibleText(stripped)) return '';

  const alreadyStructured = BLOCK_TAGS.some((tag) => stripped.includes(`<${tag}>`));
  return alreadyStructured ? stripped.trim() : wrapParagraphs(stripped);
}

/**
 * The reverse, for putting stored content back into a textarea (`FE-1116`) and
 * for deciding whether anything visible is left.
 */
export function minuteContentToPlainText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|ul|ol)\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
