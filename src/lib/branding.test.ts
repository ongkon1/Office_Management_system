import { describe, expect, it } from 'vitest';
import { isBrandLogoAsset, parseStoredBrandLogo } from './branding';

const logo = {
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  fileName: 'powerinai.png',
  mediaType: 'image/png' as const,
  sizeBytes: 11,
};

describe('organization branding validation', () => {
  it('accepts a stored supported logo', () => {
    expect(isBrandLogoAsset(logo)).toBe(true);
    expect(parseStoredBrandLogo(JSON.stringify(logo))).toEqual(logo);
  });

  it('rejects malformed, unsafe, and oversized logo payloads', () => {
    expect(parseStoredBrandLogo('{not-json')).toBeNull();
    expect(parseStoredBrandLogo({ ...logo, mediaType: 'image/svg+xml' })).toBeNull();
    expect(parseStoredBrandLogo({ ...logo, dataUrl: 'https://example.test/logo.png' })).toBeNull();
    expect(parseStoredBrandLogo({ ...logo, sizeBytes: 1_048_577 })).toBeNull();
  });
});
