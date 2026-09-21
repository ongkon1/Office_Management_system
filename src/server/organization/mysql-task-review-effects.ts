import { randomUUID } from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import type { AuditWriter } from '@/server/audit/writer';
import type { TaskReviewEffects } from './task-review';
import { NotificationService } from '@/server/notifications/service';
export class MysqlTaskReviewEffects implements TaskReviewEffects {
    constructor(private pool: Pool, private auditWriter: AuditWriter) {}
    async audit(i: Parameters<TaskReviewEffects['audit']>[0]) { await this.auditWriter.append({ actorUserId: i.actorUserId, action: i.action, resourceType: 'task', resourceId: i.taskId, scope: {}, reason: i.reason, correlationId: randomUUID(), before: i.before, after: i.after }); }
    async notify(i: Parameters<TaskReviewEffects['notify']>[0]) { await new NotificationService(this.pool).send({ employeeIds: [i.recipientEmployeeId], type: i.type, resourceType: 'task', resourceId: i.taskId, eventKey: `${i.type}:${i.taskId}` }); }
}
