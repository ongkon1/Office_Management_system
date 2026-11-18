import { randomUUID } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { WorkLocation } from '@/contracts/domain';
import type { DurationView } from '@/contracts/view-models';
import { addDays, formatDate } from '@/lib/format';
import { toDurationView } from '@/lib/status';
import { clockInstant, localParts } from '@/lib/calculation/instants';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { recordAudit } from '@/server/audit/record';
import { TimeApplication } from '@/server/time/application';
import { MysqlTimeRepository } from '@/server/time/mysql-repository';
import { isModuleEnabled } from '@/server/supporting/modules';
import { conflict, guarded, invalid, notFound } from '@/server/supporting/results';
import { ProviderError, type OAuthService } from './oauth';

type Row = RowDataPacket & Record<string, unknown>;
const ZONE = 'Asia/Dhaka';

export interface CalendarEvent {
  readonly id: string;
  /** Provider version marker (Google etag, Microsoft changeKey). */
  readonly changeKey: string;
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
  readonly title: string;
  readonly cancelled: boolean;
  readonly declined: boolean;
}

/** `BE-0732`: what a calendar provider must offer. Read-only, bounded by a time window. */
export interface CalendarProvider {
  listEvents(accessToken: string, window: { readonly from: string; readonly to: string }): Promise<readonly CalendarEvent[]>;
}

const MAX_PAGES = 20;

async function providerJson(http: typeof fetch, url: string, accessToken: string, headers: Record<string, string> = {}) {
  let response: Response;
  try {
    response = await http(url, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', ...headers } });
  } catch {
    throw new ProviderError('provider_unreachable', null, true);
  }
  if (!response.ok) throw new ProviderError(`events_http_${response.status}`, response.status, response.status >= 500 || response.status === 429);
  return response.json() as Promise<Record<string, unknown>>;
}

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly http: typeof fetch = fetch) {}
  async listEvents(accessToken: string, window: { from: string; to: string }) {
    const events: CalendarEvent[] = [];
    let pageToken: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.search = new URLSearchParams({ timeMin: window.from, timeMax: window.to, singleEvents: 'true', orderBy: 'startTime', maxResults: '250', ...(pageToken ? { pageToken } : {}) }).toString();
      const body = await providerJson(this.http, url.toString(), accessToken);
      for (const item of (body.items as Record<string, unknown>[] | undefined) ?? []) {
        const start = item.start as { dateTime?: string; date?: string } | undefined;
        const end = item.end as { dateTime?: string; date?: string } | undefined;
        const self = ((item.attendees as { self?: boolean; responseStatus?: string }[] | undefined) ?? []).find((attendee) => attendee.self);
        events.push({
          id: String(item.id), changeKey: String(item.etag ?? item.updated ?? ''), start: String(start?.dateTime ?? start?.date ?? ''),
          end: String(end?.dateTime ?? end?.date ?? ''), allDay: !start?.dateTime, title: String(item.summary ?? ''),
          cancelled: item.status === 'cancelled', declined: self?.responseStatus === 'declined',
        });
      }
      pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : null;
      if (!pageToken) break;
    }
    return events;
  }
}

export class MicrosoftCalendarProvider implements CalendarProvider {
  constructor(private readonly http: typeof fetch = fetch) {}
  async listEvents(accessToken: string, window: { from: string; to: string }) {
    const events: CalendarEvent[] = [];
    const first = new URL('https://graph.microsoft.com/v1.0/me/calendarView');
    first.search = new URLSearchParams({ startDateTime: window.from, endDateTime: window.to, $top: '250', $select: 'id,changeKey,subject,start,end,isAllDay,isCancelled,responseStatus' }).toString();
    let next: string | null = first.toString();
    for (let page = 0; next && page < MAX_PAGES; page += 1) {
      // Follow paging links only on Microsoft Graph itself.
      if (new URL(next).hostname !== 'graph.microsoft.com') break;
      const body = await providerJson(this.http, next, accessToken, { prefer: 'outlook.timezone="UTC"' });
      for (const item of (body.value as Record<string, unknown>[] | undefined) ?? []) {
        const start = item.start as { dateTime?: string } | undefined;
        const end = item.end as { dateTime?: string } | undefined;
        const asUtc = (value?: string) => (value ? (/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`) : '');
        events.push({
          id: String(item.id), changeKey: String(item.changeKey ?? ''), start: asUtc(start?.dateTime), end: asUtc(end?.dateTime),
          allDay: Boolean(item.isAllDay), title: String(item.subject ?? ''), cancelled: Boolean(item.isCancelled),
          declined: (item.responseStatus as { response?: string } | undefined)?.response === 'declined',
        });
      }
      next = typeof body['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : null;
    }
    return events;
  }
}

/**
 * `BE-0733`. An event proposes minutes for the local date it starts on, clipped
 * at that local midnight — it is a suggestion the employee edits, not a
 * measurement. All-day, cancelled, declined, zero-length and longer-than-a-day
 * events propose nothing.
 */
export function eventToProposal(event: CalendarEvent): { readonly workDate: string; readonly minutes: number; readonly description: string } | null {
  if (event.allDay || event.cancelled || event.declined) return null;
  const start = Date.parse(event.start), end = Date.parse(event.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86_400_000) return null;
  const workDate = localParts(new Date(start).toISOString(), ZONE).date;
  const midnight = Date.parse(clockInstant(addDays(workDate, 1), '00:00', ZONE)!);
  const minutes = Math.floor((Math.min(end, midnight) - start) / 60_000);
  if (minutes < 1) return null;
  const title = event.title.replace(/\s+/g, ' ').trim().slice(0, 200);
  return { workDate, minutes, description: title ? `Calendar: ${title}` : 'Calendar event' };
}

export interface CalendarDraftView {
  readonly id: string;
  readonly connectionId: string;
  readonly workDate: string;
  readonly workDateLabel: string;
  readonly proposed: DurationView;
  readonly suggestedDescription: string;
  readonly version: number;
}

export interface ConfirmDraftInput {
  readonly divisionId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly durationMinutes: number;
  readonly workLocation: WorkLocation;
  readonly workDescription: string;
  readonly completedWork: string;
  readonly overtimeReason: string | null;
  readonly criticalExplanation: string | null;
  readonly expectedVersion: number;
}

/**
 * Calendar synchronization and drafts (`BE-0732`, `BE-0733`, `BE-0736`,
 * `REQ-INT-002`, `REQ-INT-008`).
 *
 * Synced events become rows in `calendar_work_drafts` — not work logs — so no
 * total, report, export or payroll figure can see them. A draft becomes time
 * only when its employee confirms it, and confirmation goes through
 * `TimeApplication.save` exactly like interactive entry: the task must be In
 * Progress and eligible, the division effective, government access held, the
 * period unlocked, the day under 24:00, overtime and critical reasons given —
 * and the save is audited, recalculated and published like any other. The
 * work log's idempotency key is derived from the draft, so two confirmations
 * cannot create two logs.
 */
export class CalendarSyncService {
  constructor(
    private readonly pool: Pool,
    private readonly oauth: OAuthService,
    private readonly providers: Readonly<Record<string, CalendarProvider>>,
    private readonly now = () => new Date().toISOString(),
  ) {}

  private today() { return localParts(this.now(), ZONE).date; }

  /** Worker: sync every active connection whose next sync is due. */
  async syncDue(limit = 10) {
    if (!(await isModuleEnabled(this.pool, 'integrations'))) return [];
    const [rows] = await this.pool.query<Row[]>(
      "SELECT id FROM integration_connections WHERE status='active' AND revoked_at IS NULL AND next_sync_at<=? ORDER BY next_sync_at LIMIT ?", [new Date(this.now()), limit]);
    const results = [];
    for (const row of rows) results.push(await this.sync(String(row.id)));
    return results;
  }

  /** Sync one connection; failures are recorded on it and back off, never thrown. */
  async sync(connectionId: string): Promise<{ readonly connectionId: string; readonly outcome: 'synced' | 'reauthorization_required' | 'failed'; readonly drafts: number; readonly withdrawn: number }> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT c.id,c.provider_key,c.owner_user_id,c.sync_settings,c.consecutive_failures,e.id employee_id FROM integration_connections c
       JOIN employees e ON e.user_id=c.owner_user_id AND e.status='active' WHERE c.id=? AND c.revoked_at IS NULL AND c.status='active'`, [connectionId]);
    const connection = rows[0];
    if (!connection) return { connectionId, outcome: 'failed', drafts: 0, withdrawn: 0 };
    const provider = this.providers[String(connection.provider_key)];
    const settings = (typeof connection.sync_settings === 'string' ? JSON.parse(connection.sync_settings) : connection.sync_settings ?? {}) as { lookbackDays?: number };
    const lookback = Math.min(31, Math.max(1, Number(settings.lookbackDays ?? 14)));
    const from = clockInstant(addDays(this.today(), -lookback), '00:00', ZONE)!;
    const to = this.now();
    try {
      if (!provider) throw new ProviderError('provider_unavailable', null, false);
      const events = await provider.listEvents(await this.oauth.accessToken(connectionId), { from, to });
      let drafts = 0;
      const seen = new Set<string>();
      const [known] = await this.pool.execute<Row[]>('SELECT provider_event_id,work_date FROM calendar_work_drafts WHERE connection_id=?', [connectionId]);
      const existing = new Set(known.map((row) => `${row.provider_event_id}|${row.work_date instanceof Date ? row.work_date.toISOString().slice(0, 10) : String(row.work_date).slice(0, 10)}`));
      for (const event of events) {
        const proposal = eventToProposal(event);
        if (!proposal || proposal.workDate > this.today()) continue;
        seen.add(`${event.id}|${proposal.workDate}`);
        // A confirmed or dismissed draft is final: a later change to the event never revives it.
        await this.pool.execute(
          `INSERT INTO calendar_work_drafts(id,connection_id,employee_id,provider_event_id,provider_change_key,work_date,timezone,proposed_minutes,suggested_description)
           VALUES(?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             proposed_minutes=IF(state='draft' AND provider_change_key<>VALUES(provider_change_key),VALUES(proposed_minutes),proposed_minutes),
             suggested_description=IF(state='draft' AND provider_change_key<>VALUES(provider_change_key),VALUES(suggested_description),suggested_description),
             version=IF(state='draft' AND provider_change_key<>VALUES(provider_change_key),version+1,version),
             provider_change_key=IF(state='draft',VALUES(provider_change_key),provider_change_key)`,
          [randomUUID(), connectionId, String(connection.employee_id), event.id.slice(0, 255), event.changeKey.slice(0, 255), proposal.workDate, ZONE, Math.min(1440, proposal.minutes), proposal.description]);
        if (!existing.has(`${event.id.slice(0, 255)}|${proposal.workDate}`)) drafts += 1;
      }
      // Drafts inside the window whose event disappeared, was cancelled or moved: withdrawn, never deleted.
      const [open] = await this.pool.execute<Row[]>("SELECT id,provider_event_id,work_date FROM calendar_work_drafts WHERE connection_id=? AND state='draft' AND work_date>=?",
        [connectionId, addDays(this.today(), -lookback)]);
      let withdrawn = 0;
      for (const draft of open) {
        const workDate = draft.work_date instanceof Date ? draft.work_date.toISOString().slice(0, 10) : String(draft.work_date).slice(0, 10);
        if (seen.has(`${draft.provider_event_id}|${workDate}`)) continue;
        await this.pool.execute("UPDATE calendar_work_drafts SET state='withdrawn',decided_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=? AND state='draft'", [draft.id]);
        withdrawn += 1;
      }
      await this.pool.execute('INSERT INTO integration_sync_cursors(connection_id,last_synced_at) VALUES(?,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE last_synced_at=UTC_TIMESTAMP(6),version=version+1', [connectionId]);
      await this.pool.execute("UPDATE integration_connections SET consecutive_failures=0,last_error_code=NULL,next_sync_at=? WHERE id=?", [new Date(Date.parse(this.now()) + 3_600_000), connectionId]);
      return { connectionId, outcome: 'synced', drafts, withdrawn };
    } catch (error) {
      const failure = error instanceof ProviderError ? error : new ProviderError('sync_failed', null, true);
      if (failure.code === 'reauthorization_required' || failure.status === 401) {
        await this.pool.execute("UPDATE integration_connections SET status='reauthorization_required',last_error_code=? WHERE id=?", [failure.code, connectionId]);
        return { connectionId, outcome: 'reauthorization_required', drafts: 0, withdrawn: 0 };
      }
      const failures = Number(connection.consecutive_failures) + 1;
      const delay = Math.min(6 * 3_600_000, 5 * 60_000 * 2 ** (failures - 1));
      await this.pool.execute('UPDATE integration_connections SET consecutive_failures=?,last_error_code=?,next_sync_at=? WHERE id=?',
        [failures, failure.code.slice(0, 64), new Date(Date.parse(this.now()) + delay), connectionId]);
      return { connectionId, outcome: 'failed', drafts: 0, withdrawn: 0 };
    }
  }

  /** The employee's own open drafts. Nobody else sees them — not a lead, not HR. */
  drafts(actor: ActorPolicyContext): Promise<Result<readonly CalendarDraftView[]>> {
    return guarded(async () => {
      if (!actor.employeeId) return success([]);
      const [rows] = await this.pool.execute<Row[]>(
        "SELECT id,connection_id,work_date,proposed_minutes,suggested_description,version FROM calendar_work_drafts WHERE employee_id=? AND state='draft' ORDER BY work_date DESC,id LIMIT 200",
        [actor.employeeId]);
      return success(rows.map((row) => {
        const workDate = row.work_date instanceof Date ? row.work_date.toISOString().slice(0, 10) : String(row.work_date).slice(0, 10);
        return {
          id: String(row.id), connectionId: String(row.connection_id), workDate, workDateLabel: formatDate(workDate),
          proposed: toDurationView(Number(row.proposed_minutes)), suggestedDescription: String(row.suggested_description), version: Number(row.version),
        };
      }));
    });
  }

  private async ownDraft(actor: ActorPolicyContext, id: string) {
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM calendar_work_drafts WHERE id=? AND employee_id=?', [id, actor.employeeId ?? '']);
    return rows[0] ?? null;
  }

  confirm(actor: ActorPolicyContext, id: string, input: ConfirmDraftInput): Promise<Result<{ readonly workLogId: string }>> {
    return guarded(async () => {
      const draft = await this.ownDraft(actor, id);
      if (!draft) return notFound('draft');
      if (draft.state !== 'draft') {
        return draft.state === 'confirmed' && draft.work_log_id
          ? success({ workLogId: String(draft.work_log_id) })
          : conflict('This draft is no longer open.', 'Refresh the list of calendar drafts.');
      }
      if (Number(draft.version) !== input.expectedVersion) return conflict('This draft changed after the calendar synced.', 'Review the new proposal and confirm again.');
      const workDate = draft.work_date instanceof Date ? draft.work_date.toISOString().slice(0, 10) : String(draft.work_date).slice(0, 10);
      const idempotencyKey = `calendar-draft:${id}`;
      const time = new TimeApplication(new MysqlTimeRepository(this.pool), async () => actor, this.now);
      // The same rules as a work log typed by hand (`REQ-INT-008`).
      const saved = await time.saveImported({
        employeeId: actor.employeeId!, workDate, divisionId: input.divisionId, projectId: input.projectId, taskId: input.taskId,
        durationMinutes: input.durationMinutes, workLocation: input.workLocation, workDescription: input.workDescription,
        completedWork: input.completedWork, supportingLink: null, attachmentIds: [], overtimeReason: input.overtimeReason,
        criticalExplanation: input.criticalExplanation, source: 'imported', idempotencyKey,
      });
      let workLogId: string;
      if (saved.status === 'success') workLogId = saved.data.id;
      else {
        // A concurrent confirmation may already have saved the log under this draft's key.
        const [existing] = await this.pool.execute<Row[]>('SELECT id FROM time_entries WHERE idempotency_key=? AND employee_id=?', [idempotencyKey, actor.employeeId]);
        if (saved.status !== 'conflict' || !existing[0]) return saved;
        workLogId = String(existing[0].id);
      }
      await this.pool.execute("UPDATE calendar_work_drafts SET state='confirmed',work_log_id=?,decided_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=? AND state='draft'", [workLogId, id]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'calendar.draft_confirmed', resourceType: 'calendar_draft', resourceId: id, after: { workLogId, proposedMinutes: Number(draft.proposed_minutes), confirmedMinutes: input.durationMinutes } });
      return success({ workLogId });
    });
  }

  dismiss(actor: ActorPolicyContext, id: string, expectedVersion: number): Promise<Result<{ readonly id: string }>> {
    return guarded(async () => {
      const draft = await this.ownDraft(actor, id);
      if (!draft) return notFound('draft');
      if (!Number.isInteger(expectedVersion)) return invalid('expectedVersion', 'The draft version is missing.', 'Refresh and try again.');
      const [result] = await this.pool.execute<ResultSetHeader>("UPDATE calendar_work_drafts SET state='dismissed',decided_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=? AND state='draft' AND version=?", [id, expectedVersion]);
      if (!result.affectedRows) return conflict('This draft changed or is no longer open.', 'Refresh the list of calendar drafts.');
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'calendar.draft_dismissed', resourceType: 'calendar_draft', resourceId: id });
      return success({ id });
    });
  }
}
