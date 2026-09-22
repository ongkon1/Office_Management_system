import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockAdminService, resetAdminState } from '@/services/mock/admin';
import { BrandLogo } from './brand-logo';

const ADMIN = 'usr-9001';

describe('BrandLogo', () => {
  beforeEach(() => resetAdminState());

  it('changes every mounted logo when an administrator saves a custom asset', async () => {
    const first = render(<BrandLogo size="sm" />);
    const second = render(<BrandLogo size="md" />);
    expect(first.container).toHaveTextContent('T');
    expect(second.container).toHaveTextContent('T');
    expect(first.container).toHaveTextContent('Beta');
    expect(second.container).toHaveTextContent('Beta');

    await act(async () => {
      await mockAdminService.updateBranding(ADMIN, {
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        fileName: 'powerinai.png',
        mediaType: 'image/png',
        sizeBytes: 11,
      });
    });

    expect(first.container).not.toHaveTextContent('T');
    expect(second.container).not.toHaveTextContent('T');
    expect(first.container.querySelector('img')).toHaveAttribute(
      'src',
      'data:image/png;base64,iVBORw0KGgo=',
    );
    expect(second.container.querySelector('img')).toHaveAttribute(
      'src',
      'data:image/png;base64,iVBORw0KGgo=',
    );
    expect(first.container).toHaveTextContent('Beta');
    expect(second.container).toHaveTextContent('Beta');
  });
});
