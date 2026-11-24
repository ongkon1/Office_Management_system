import { describe, expect, it } from 'vitest';
import { configuredExportBucket } from './composition';

describe('reporting composition configuration', () => {
    it('falls back to the shared S3 bucket when the export-specific value is blank', () => {
        expect(configuredExportBucket({
            EXPORT_S3_BUCKET: '',
            S3_BUCKET: 'office-management-private',
        })).toBe('office-management-private');
    });

    it('prefers a non-blank export-specific bucket and trims configuration whitespace', () => {
        expect(configuredExportBucket({
            EXPORT_S3_BUCKET: ' finance-exports ',
            S3_BUCKET: 'office-management-private',
        })).toBe('finance-exports');
    });
});
