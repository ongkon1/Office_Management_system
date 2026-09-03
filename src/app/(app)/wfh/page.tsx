'use client';

import { RequestAdministration } from '@/features/hr/requests-admin';
import { WfhSelfService } from '@/features/workspace/self-service';
import { useSession } from '@/features/access/session-provider';

/**
 * One route, two audiences: HR administers requests here, everyone else
 * manages their own. Both are real screens — neither role sees a placeholder.
 */
export default function WfhPage() {
  const { user } = useSession();
  const isHr = user?.primaryRole === 'hr_manager' || user?.primaryRole === 'super_admin';
  return isHr ? <RequestAdministration kind="wfh" /> : <WfhSelfService />;
}
