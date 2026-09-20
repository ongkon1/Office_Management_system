import { describe, expect, it } from 'vitest';
import { minuteContentToPlainText, sanitizeMinuteContent } from './minute-content';

/**
 * `FE-1113` — what a minute may store (`REQ-MTG-006`).
 *
 * The cases that matter are the ones a plain "strip tags" pass gets wrong: a
 * script whose *text* survives, an attribute that carries the payload, and a
 * paste that turns out to hold nothing once the markup is gone.
 */

describe('sanitizeMinuteContent', () => {
  it('wraps typed text in paragraphs and keeps single breaks', () => {
    expect(sanitizeMinuteContent('First line\nSecond line\n\nNext paragraph')).toBe(
      '<p>First line<br />Second line</p><p>Next paragraph</p>',
    );
  });

  it('drops a script with its text, not just its tags', () => {
    const sanitized = sanitizeMinuteContent('<p>Agreed</p><script>steal(document.cookie)</script>');
    expect(sanitized).toBe('<p>Agreed</p>');
    expect(sanitized).not.toContain('steal');
  });

  it('drops an unclosed dangerous element rather than guessing where it ends', () => {
    expect(sanitizeMinuteContent('<p>Agreed</p><script>steal()')).toBe('<p>Agreed</p>');
  });

  it('keeps allowed tags but no attributes', () => {
    expect(sanitizeMinuteContent('<p onclick="x()">Ship <strong class="a">Monday</strong></p>')).toBe(
      '<p>Ship <strong>Monday</strong></p>',
    );
  });

  it('keeps the text of a disallowed tag', () => {
    expect(sanitizeMinuteContent('<div><span style="color:red">Due Friday</span></div>')).toBe(
      '<p>Due Friday</p>',
    );
  });

  it('escapes anything still looking like markup', () => {
    expect(sanitizeMinuteContent('Budget < 5 lakh & rising')).toBe(
      '<p>Budget &lt; 5 lakh &amp; rising</p>',
    );
  });

  it('returns empty when the paste was nothing but removed markup', () => {
    expect(sanitizeMinuteContent('<script>alert(1)</script>')).toBe('');
    expect(sanitizeMinuteContent('<div>   </div>')).toBe('');
  });
});

describe('minuteContentToPlainText', () => {
  it('round-trips typed content', () => {
    const typed = 'First line\nSecond line\n\nNext paragraph';
    expect(minuteContentToPlainText(sanitizeMinuteContent(typed))).toBe(typed);
  });

  it('decodes escaped markup back to the characters the author typed', () => {
    expect(minuteContentToPlainText(sanitizeMinuteContent('a < b & c'))).toBe('a < b & c');
  });
});
