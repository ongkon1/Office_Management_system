'use client';

import { ProfileScreen } from '@/features/tasks/divisions-remarks-profile';
import { useSession } from '@/features/access/session-provider';

export default function ProfilePage() {
  const { user } = useSession();
  if (!user) return null;
  return <ProfileScreen userId={user.userId} />;
}
