import type { NotificationType } from '@/contracts/domain';
import { NOTIFICATIONS, type NotificationFixture } from '@/fixtures/workspace';
import { DEMO_ACCOUNTS } from './accounts';

let runtimeNotifications: NotificationFixture[] = [];
let sequence = 0;

export function allMockNotifications(): readonly NotificationFixture[] {
  return [...runtimeNotifications, ...NOTIFICATIONS];
}

export function addMockNotification(input: Omit<NotificationFixture, 'id' | 'createdAt' | 'isRead'>): void {
  sequence += 1;
  runtimeNotifications = [{
    ...input,
    id: `ntf-runtime-${sequence}`,
    createdAt: new Date().toISOString(),
    isRead: false,
  }, ...runtimeNotifications];
}

export function notifyEmployee(
  employeeId: string,
  input: {
    readonly type: NotificationType;
    readonly title: string;
    readonly body: string;
    readonly href: string | null;
    readonly relatedLabel: string | null;
  },
): void {
  const recipient = DEMO_ACCOUNTS.find((account) => account.employeeId === employeeId);
  if (recipient) addMockNotification({ ...input, recipientUserId: recipient.userId });
}

export function resetMockNotifications(): void {
  runtimeNotifications = [];
  sequence = 0;
}
