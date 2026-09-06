'use client';

import { RequestAdministration } from '@/features/hr/requests-admin';
import { LeaveSelfService } from '@/features/workspace/self-service';
import { useSession } from '@/features/access/session-provider';

export default function LeavePage() {
  const { user } = useSession();
  const isHr = user?.primaryRole === 'hr_manager' || user?.primaryRole === 'super_admin';
  return isHr ? <RequestAdministration kind="leave" /> : <LeaveSelfService />;
}
