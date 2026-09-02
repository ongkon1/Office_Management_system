import type { Metadata } from 'next';
import { ShowcaseClient } from './showcase-client';

export const metadata: Metadata = {
  title: 'Component showcase',
  description:
    'Every shared component in its normal, hover, focus, disabled, loading, empty, error, and dense states.',
};

export default function ShowcasePage() {
  return <ShowcaseClient />;
}
