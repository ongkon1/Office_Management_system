import type { AdminSessionView, SessionStatus } from '@/contracts/admin';
import type { EmployeeRef } from '@/contracts/view-models';

export interface AdminUserPresenceView {
  readonly userId: string;
  readonly employee: EmployeeRef;
  readonly roleLabel: string;
  readonly sessions: readonly AdminSessionView[];
  readonly status: SessionStatus;
  readonly statusLabel: AdminSessionView['statusLabel'];
  readonly deviceLabel: string;
  readonly browserLabel: string;
  readonly isCurrentSession: boolean;
  readonly canForceLogout: boolean;
}

const STATUS_RANK: Readonly<Record<SessionStatus, number>> = {
  online: 0,
  idle: 1,
  expired: 2,
};

/** One operational presence row per user, even when they use several devices. */
export function groupSessionsByUser(
  sessions: readonly AdminSessionView[],
): readonly AdminUserPresenceView[] {
  const grouped = new Map<string, AdminSessionView[]>();
  for (const session of sessions) {
    grouped.set(session.userId, [...(grouped.get(session.userId) ?? []), session]);
  }

  return [...grouped.values()]
    .map((userSessions): AdminUserPresenceView => {
      const ordered = [...userSessions].sort(
        (left, right) => STATUS_RANK[left.status] - STATUS_RANK[right.status],
      );
      const primary = ordered[0];
      const devices = [...new Set(ordered.map((session) => session.deviceLabel))];
      const browsers = [...new Set(ordered.map((session) => session.browserLabel))];
      const summarize = (values: readonly string[]) =>
        values.length <= 2
          ? values.join(', ')
          : `${values.slice(0, 2).join(', ')} +${values.length - 2} more`;

      return {
        userId: primary.userId,
        employee: primary.employee,
        roleLabel: primary.roleLabel,
        sessions: ordered,
        status: primary.status,
        statusLabel: primary.statusLabel,
        deviceLabel: summarize(devices),
        browserLabel: summarize(browsers),
        isCurrentSession: ordered.some((session) => session.isCurrentSession),
        canForceLogout: ordered.some((session) => session.canForceLogout),
      };
    })
    .sort((left, right) =>
      STATUS_RANK[left.status] - STATUS_RANK[right.status]
      || left.employee.fullName.localeCompare(right.employee.fullName),
    );
}
