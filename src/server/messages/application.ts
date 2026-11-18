import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { MessagePrototypeView, MessageThreadView } from '@/contracts/workspace';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatTimestamp } from '@/lib/format';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { isReadOnly, messageScopeReach, type MessageScopeType } from '@/server/authorization/record-access';
import { recordAudit } from '@/server/audit/record';
import { NotificationService } from '@/server/notifications/service';
import { sizeLabel } from '@/server/files/policy';
import { isModuleEnabled } from '@/server/supporting/modules';
import { businessDate, conflict, denied, guarded, invalid, notFound } from '@/server/supporting/results';

type Row = RowDataPacket & Record<string, unknown>;

const SCOPES: readonly MessageScopeType[] = ['division', 'project', 'direct', 'task_comment'];
const KIND_LABEL: Readonly<Record<MessageScopeType, string>> = {
  division: 'Division channel', project: 'Project channel', direct: 'Direct message', task_comment: 'Task comments',
};
const stamp = (value: unknown) => formatTimestamp(value instanceof Date ? value.toISOString() : String(value));
const DISABLED_NOTE = 'Messaging is switched off. A Super Administrator can switch it on in module settings.';

export interface PostMessageInput {
  readonly scopeType: MessageScopeType;
  readonly scopeId: string;
  readonly body: string;
  readonly mentionUserIds: readonly string[];
  readonly isAnnouncement: boolean;
  /** Retrying a post with the same key returns the first message, not a duplicate. */
  readonly idempotencyKey: string;
}

/**
 * Lightweight communication (`BE-0714`, `BE-0715`, `REQ-COM-001`–`004`):
 * division and project channels, two-person direct conversations, and task
 * comments, with mentions, announcements and pins. Not a Slack replacement —
 * no huddles, no channel administration.
 *
 * Who may read and post is `messageScopeReach`, re-evaluated on every call; a
 * direct conversation belongs to its two participants and nobody else. A
 * mention must name someone who can already read the conversation, so a
 * mention can never pull a message in front of someone outside it. The whole
 * module answers only while the server-owned `messages` switch is on.
 */
export class MessageApplication {
  constructor(private readonly pool: Pool, private readonly now = () => new Date().toISOString()) {}

  private date() { return businessDate(this.now()); }

  private async enabled() { return isModuleEnabled(this.pool, 'messages'); }

  private async scopeTitle(scopeType: MessageScopeType, scopeId: string, actor: ActorPolicyContext) {
    const [rows] = await this.pool.execute<Row[]>(
      scopeType === 'division' ? 'SELECT name title FROM divisions WHERE id=?'
        : scopeType === 'project' ? "SELECT CONCAT(project_code,' · ',name) title FROM projects WHERE id=?"
          : scopeType === 'task_comment' ? 'SELECT title FROM tasks WHERE id=?'
            : 'SELECT u.name title FROM direct_conversations c JOIN users u ON u.id=IF(c.user_low=?,c.user_high,c.user_low) WHERE c.id=?',
      scopeType === 'direct' ? [actor.userId, scopeId] : [scopeId]);
    return rows[0] ? String(rows[0].title) : KIND_LABEL[scopeType];
  }

  threads(actor: ActorPolicyContext): Promise<Result<MessagePrototypeView>> {
    return guarded(async () => {
      if (!(await this.enabled())) return success({ threads: [], prototypeNote: DISABLED_NOTE, deliveryPhaseLabel: 'Messaging is off' });
      const [scopes] = await this.pool.execute<Row[]>(
        'SELECT scope_type,scope_id,MAX(created_at) last_at FROM messages GROUP BY scope_type,scope_id ORDER BY last_at DESC LIMIT 200');
      const threads: MessageThreadView[] = [];
      for (const scope of scopes) {
        const scopeType = String(scope.scope_type) as MessageScopeType;
        const scopeId = String(scope.scope_id);
        const reach = await messageScopeReach(this.pool, actor, scopeType, scopeId, this.date());
        if (!reach) continue;
        const [messages] = await this.pool.query<Row[]>(
          `SELECT * FROM (SELECT m.id,m.body,m.created_at,m.sender_user_id,m.is_announcement,m.pinned_at,u.name sender_name
             FROM messages m JOIN users u ON u.id=m.sender_user_id WHERE m.scope_type=? AND m.scope_id=? ORDER BY m.created_at DESC LIMIT 100) recent
           ORDER BY created_at`, [scopeType, scopeId]);
        const [read] = await this.pool.execute<Row[]>('SELECT last_read_at FROM message_reads WHERE user_id=? AND scope_type=? AND scope_id=?', [actor.userId, scopeType, scopeId]);
        const lastRead = read[0]?.last_read_at ? new Date(read[0].last_read_at as string | Date).getTime() : 0;
        const ids = messages.map((m) => String(m.id));
        const [files] = ids.length
          ? await this.pool.query<Row[]>(
            `SELECT id,owner_id,original_name,size_bytes FROM attachments WHERE owner_type='message' AND owner_id IN (?)
             AND upload_state='completed' AND scan_status='clean' AND deactivated_at IS NULL`, [ids])
          : [[] as Row[]];
        threads.push({
          id: `${scopeType}:${scopeId}`, kind: scopeType, kindLabel: KIND_LABEL[scopeType],
          title: await this.scopeTitle(scopeType, scopeId, actor), subtitle: KIND_LABEL[scopeType],
          lastMessageAtLabel: stamp(scope.last_at),
          unreadCount: messages.filter((m) => m.sender_user_id !== actor.userId && new Date(m.created_at as string | Date).getTime() > lastRead).length,
          canModerate: reach.moderate,
          messages: messages.map((m) => ({
            id: String(m.id), authorName: String(m.sender_name), body: String(m.body), atLabel: stamp(m.created_at),
            isOwn: m.sender_user_id === actor.userId, isPinned: Boolean(m.pinned_at), isAnnouncement: Boolean(m.is_announcement),
            attachments: files.filter((f) => f.owner_id === m.id).map((f) => ({ id: String(f.id), fileName: String(f.original_name), sizeLabel: sizeLabel(Number(f.size_bytes)) })),
          })),
        });
      }
      return success({ threads, prototypeNote: 'Conversations you can read, within your division, project, task and direct-message scope.', deliveryPhaseLabel: 'Messaging' });
    });
  }

  /** The two-person conversation between the actor and another active user, created on first use. */
  startDirect(actor: ActorPolicyContext, otherUserId: string): Promise<Result<{ readonly scopeType: 'direct'; readonly scopeId: string }>> {
    return guarded(async () => {
      if (!(await this.enabled())) return conflict('Messaging is switched off.', 'Ask a Super Administrator to switch it on.');
      if (otherUserId === actor.userId) return invalid('userId', 'Choose someone else.', 'A direct message is between two people.');
      const [users] = await this.pool.execute<Row[]>("SELECT u.id FROM users u JOIN employees e ON e.user_id=u.id WHERE u.id=? AND u.status='active' AND e.status='active'", [otherUserId]);
      if (!users[0]) return notFound('person');
      const [low, high] = [actor.userId, otherUserId].sort();
      await this.pool.execute('INSERT IGNORE INTO direct_conversations(id,user_low,user_high) VALUES(?,?,?)', [randomUUID(), low, high]);
      const [rows] = await this.pool.execute<Row[]>('SELECT id FROM direct_conversations WHERE user_low=? AND user_high=?', [low, high]);
      return success({ scopeType: 'direct' as const, scopeId: String(rows[0].id) });
    });
  }

  post(actor: ActorPolicyContext, input: PostMessageInput): Promise<Result<{ readonly id: string }>> {
    return guarded(async () => {
      if (!(await this.enabled())) return conflict('Messaging is switched off.', 'Ask a Super Administrator to switch it on.');
      if (!SCOPES.includes(input.scopeType)) return invalid('scopeType', 'Choose a conversation.', 'Open the channel, task or person first.');
      if (isReadOnly(actor)) return denied('View-only access cannot post messages.');
      const body = input.body.trim();
      if (!body || body.length > 4000) return invalid('body', 'Write a message of up to 4,000 characters.', 'Split a long message, or attach a document.');
      if (!/^[A-Za-z0-9:_-]{8,128}$/.test(input.idempotencyKey)) return invalid('idempotencyKey', 'The message could not be identified.', 'Reload the page and send it again.');
      const date = this.date();
      const reach = await messageScopeReach(this.pool, actor, input.scopeType, input.scopeId, date);
      if (!reach) return notFound('conversation');
      if (input.isAnnouncement && !reach.moderate) return denied('Only the Team Lead or manager of this space can post announcements.');
      const [existing] = await this.pool.execute<Row[]>('SELECT id,scope_type,scope_id,body FROM messages WHERE sender_user_id=? AND idempotency_key=?', [actor.userId, input.idempotencyKey]);
      if (existing[0]) {
        return existing[0].scope_type === input.scopeType && existing[0].scope_id === input.scopeId && existing[0].body === body
          ? success({ id: String(existing[0].id) })
          : conflict('This message key was already used for a different message.', 'Reload the page and send it again.');
      }
      const mentions = [...new Set(input.mentionUserIds)].filter((id) => id !== actor.userId);
      if (mentions.length > 20) return invalid('mentionUserIds', 'Mention at most 20 people.', 'Use an announcement to reach everyone.');
      for (const userId of mentions) {
        const other = await loadActorPolicyContext(this.pool, userId, date);
        if (!other || !(await messageScopeReach(this.pool, other, input.scopeType, input.scopeId, date)))
          return invalid('mentionUserIds', 'You can only mention people who are part of this conversation.', 'Remove the mention, or message them directly.');
      }
      const id = randomUUID();
      const connection = await this.pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute('INSERT INTO messages(id,sender_user_id,scope_type,scope_id,body,is_announcement,idempotency_key) VALUES(?,?,?,?,?,?,?)',
          [id, actor.userId, input.scopeType, input.scopeId, body, input.isAnnouncement, input.idempotencyKey]);
        for (const userId of mentions) await connection.execute('INSERT INTO message_mentions(message_id,mentioned_user_id) VALUES(?,?)', [id, userId]);
        await this.markReadOn(connection, actor.userId, input.scopeType, input.scopeId);
        const notifications = new NotificationService(connection, this.now);
        if (mentions.length) await notifications.notify({ recipientUserIds: mentions, type: 'message_mention', related: { type: 'message', id }, occurrenceKey: `mention:${id}` });
        if (input.isAnnouncement) {
          await notifications.notify({
            recipientUserIds: (await this.audience(connection, input.scopeType, input.scopeId, date)).filter((user) => user !== actor.userId),
            type: 'announcement_posted', related: { type: 'message', id }, occurrenceKey: `announcement:${id}`,
          });
        }
        await recordAudit(connection, { actorUserId: actor.userId, action: input.isAnnouncement ? 'message.announced' : 'message.posted', resourceType: 'message', resourceId: id,
          scope: { scopeType: input.scopeType, scopeId: input.scopeId }, after: { mentionCount: mentions.length } });
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return success({ id });
    });
  }

  /** Candidate readers for an announcement; each is still authorized individually by `notify`. */
  private async audience(db: PoolConnection, scopeType: MessageScopeType, scopeId: string, date: string): Promise<string[]> {
    const sql = scopeType === 'division'
      ? `SELECT DISTINCT e.user_id FROM employee_division_assignments a JOIN employees e ON e.id=a.employee_id
         WHERE a.division_id=? AND a.is_active=TRUE AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)`
      : scopeType === 'project'
        ? `SELECT DISTINCT e.user_id FROM employees e WHERE e.id IN (SELECT employee_id FROM project_members WHERE project_id=? AND is_active=TRUE
           AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) UNION SELECT manager_employee_id FROM projects WHERE id=?)`
        : `SELECT DISTINCT e.user_id FROM employees e WHERE e.id IN (SELECT assignee_employee_id FROM tasks WHERE id=?
           UNION SELECT employee_id FROM task_members WHERE task_id=?)`;
    const values = scopeType === 'division' ? [scopeId, date, date]
      : scopeType === 'project' ? [scopeId, date, date, scopeId] : [scopeId, scopeId];
    const [rows] = await db.execute<Row[]>(sql, values);
    return rows.map((row) => String(row.user_id));
  }

  pin(actor: ActorPolicyContext, messageId: string, pinned: boolean): Promise<Result<{ readonly id: string; readonly isPinned: boolean }>> {
    return guarded(async () => {
      if (!(await this.enabled())) return conflict('Messaging is switched off.', 'Ask a Super Administrator to switch it on.');
      const [rows] = await this.pool.execute<Row[]>('SELECT scope_type,scope_id FROM messages WHERE id=?', [messageId]);
      if (!rows[0]) return notFound('message');
      const reach = await messageScopeReach(this.pool, actor, String(rows[0].scope_type) as MessageScopeType, String(rows[0].scope_id), this.date());
      if (!reach) return notFound('message');
      if (!reach.moderate || isReadOnly(actor)) return denied('Only the Team Lead or manager of this space can pin messages.');
      await this.pool.execute(`UPDATE messages SET pinned_at=${pinned ? 'UTC_TIMESTAMP(6)' : 'NULL'},pinned_by_user_id=?,version=version+1 WHERE id=?`, [pinned ? actor.userId : null, messageId]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: pinned ? 'message.pinned' : 'message.unpinned', resourceType: 'message', resourceId: messageId });
      return success({ id: messageId, isPinned: pinned });
    });
  }

  markRead(actor: ActorPolicyContext, scopeType: MessageScopeType, scopeId: string): Promise<Result<{ readonly scopeType: MessageScopeType; readonly scopeId: string }>> {
    return guarded(async () => {
      if (!SCOPES.includes(scopeType) || !(await messageScopeReach(this.pool, actor, scopeType, scopeId, this.date()))) return notFound('conversation');
      await this.markReadOn(this.pool, actor.userId, scopeType, scopeId);
      return success({ scopeType, scopeId });
    });
  }

  private async markReadOn(db: Pick<Pool | PoolConnection, 'execute'>, userId: string, scopeType: MessageScopeType, scopeId: string) {
    await db.execute('INSERT INTO message_reads(user_id,scope_type,scope_id,last_read_at) VALUES(?,?,?,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE last_read_at=UTC_TIMESTAMP(6)', [userId, scopeType, scopeId]);
  }
}
