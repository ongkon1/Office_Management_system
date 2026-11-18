import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { SearchEntityKind } from '@/contracts/workspace';
import { formatDate } from '@/lib/format';
import { CATEGORY_LABEL, type DocumentCategory } from '@/server/documents/application';

type Row = RowDataPacket & Record<string, unknown>;

export const SEARCH_KINDS: readonly SearchEntityKind[] = ['employee', 'division', 'project', 'task', 'timesheet', 'remark', 'document'];

const isoDate = (value: unknown) => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
/** Index the words people search for (`under time`), never stored codes (`under_time`). */
const label = (value: unknown) => String(value ?? '').replace(/_/g, ' ');
const clip = (value: unknown, length: number) => value == null ? '' : String(value).replace(/\s+/g, ' ').trim().slice(0, length);

/** One row of `search_metadata`. Filter columns only; visibility is never read from here. */
interface IndexEntry {
  readonly resourceId: string;
  readonly title: string;
  readonly text: string;
  readonly version: number;
  readonly divisionId: string | null;
  readonly projectId: string | null;
  readonly employeeId: string | null;
  readonly status: string | null;
  readonly location: string | null;
  readonly occurredOn: string | null;
  readonly fileType: string | null;
  readonly isActive: boolean;
}

const SOURCES: Readonly<Record<SearchEntityKind, { readonly sql: string; readonly map: (row: Row) => IndexEntry }>> = {
  employee: {
    sql: `SELECT e.id,e.display_name,e.employee_code,e.job_title,e.status,e.version,
      (SELECT a.division_id FROM employee_division_assignments a WHERE a.employee_id=e.id AND a.is_primary=TRUE AND a.is_active=TRUE ORDER BY a.effective_from DESC LIMIT 1) division_id
      FROM employees e`,
    map: (r) => ({ resourceId: String(r.id), title: clip(r.display_name, 512), text: clip(`${r.employee_code} ${r.job_title ?? ''}`, 2000), version: Number(r.version),
      divisionId: r.division_id ? String(r.division_id) : null, projectId: null, employeeId: String(r.id), status: String(r.status), location: null, occurredOn: null, fileType: null, isActive: r.status === 'active' }),
  },
  division: {
    sql: 'SELECT id,name,division_key,description,is_active,version FROM divisions',
    map: (r) => ({ resourceId: String(r.id), title: clip(r.name, 512), text: clip(`${r.division_key} ${r.description ?? ''}`, 2000), version: Number(r.version),
      divisionId: String(r.id), projectId: null, employeeId: null, status: r.is_active ? 'active' : 'inactive', location: null, occurredOn: null, fileType: null, isActive: Boolean(r.is_active) }),
  },
  project: {
    sql: 'SELECT id,name,project_code,client_name,status,division_id,start_date,is_active,version FROM projects',
    map: (r) => ({ resourceId: String(r.id), title: clip(r.name, 512), text: clip(`${r.project_code} ${r.client_name ?? ''}`, 2000), version: Number(r.version),
      divisionId: String(r.division_id), projectId: String(r.id), employeeId: null, status: String(r.status), location: null, occurredOn: isoDate(r.start_date), fileType: null, isActive: Boolean(r.is_active) }),
  },
  task: {
    sql: `SELECT t.id,t.title,t.description,t.status,t.project_id,p.division_id,t.assignee_employee_id,t.due_date,t.is_active,t.version
      FROM tasks t JOIN projects p ON p.id=t.project_id`,
    map: (r) => ({ resourceId: String(r.id), title: clip(r.title, 512), text: clip(r.description, 2000), version: Number(r.version),
      divisionId: String(r.division_id), projectId: String(r.project_id), employeeId: r.assignee_employee_id ? String(r.assignee_employee_id) : null,
      status: String(r.status), location: null, occurredOn: isoDate(r.due_date), fileType: null, isActive: Boolean(r.is_active) }),
  },
  timesheet: {
    sql: `SELECT s.id,s.employee_id,s.work_date,s.classification,s.source_version version,e.display_name,
      (SELECT te.work_location FROM time_entries te WHERE te.employee_id=s.employee_id AND te.work_date=s.work_date AND te.is_active=TRUE AND te.status<>'draft'
        GROUP BY te.work_location ORDER BY SUM(te.active_minutes) DESC LIMIT 1) work_location
      FROM daily_summaries s JOIN employees e ON e.id=s.employee_id`,
    map: (r) => ({ resourceId: String(r.id), title: clip(`${r.display_name} · ${formatDate(isoDate(r.work_date)!)}`, 512), text: clip(`Timesheet ${label(r.classification)}`, 2000),
      version: Number(r.version), divisionId: null, projectId: null, employeeId: String(r.employee_id), status: String(r.classification),
      location: r.work_location ? String(r.work_location) : null, occurredOn: isoDate(r.work_date), fileType: null, isActive: true }),
  },
  remark: {
    sql: 'SELECT id,employee_id,message,status,created_at,related_work_date,version FROM general_remarks',
    map: (r) => ({ resourceId: String(r.id), title: clip(`General remark · ${formatDate(isoDate(r.related_work_date ?? r.created_at)!)}`, 512), text: clip(r.message, 2000),
      version: Number(r.version), divisionId: null, projectId: null, employeeId: String(r.employee_id), status: String(r.status), location: null,
      occurredOn: isoDate(r.related_work_date ?? r.created_at), fileType: null, isActive: true }),
  },
  document: {
    sql: `SELECT d.id,d.title,d.description,d.category,d.division_id,d.project_id,d.is_active,d.version,d.updated_at,
      a.original_name,v.external_link FROM documents d
      LEFT JOIN document_versions v ON v.document_id=d.id AND v.version_number=d.current_version_number
      LEFT JOIN attachments a ON a.id=v.attachment_id`,
    map: (r) => ({ resourceId: String(r.id), title: clip(r.title, 512), text: clip(`${CATEGORY_LABEL[String(r.category) as DocumentCategory] ?? label(r.category)} ${r.description ?? ''}`, 2000), version: Number(r.version),
      divisionId: r.division_id ? String(r.division_id) : null, projectId: r.project_id ? String(r.project_id) : null, employeeId: null,
      status: r.is_active ? 'active' : 'inactive', location: null, occurredOn: isoDate(r.updated_at),
      fileType: r.external_link ? 'link' : r.original_name ? String(r.original_name).split('.').pop()!.toLowerCase() : null, isActive: Boolean(r.is_active) }),
  },
};

/**
 * Builds `search_metadata` from the source tables (`BE-0720`, `BE-0722`).
 *
 * The index is derived data and may be stale between runs. That is safe by
 * construction: search re-reads and re-authorizes every candidate against its
 * live row, so a stale entry can only make a record harder to find — never
 * show one, or its title, snippet or file name, to someone who cannot see it.
 */
export class SearchIndexer {
  constructor(private readonly pool: Pool) {}

  /** Rebuild one kind or all; rows whose source has gone are removed. Returns entries written per kind. */
  async reindex(kinds: readonly SearchEntityKind[] = SEARCH_KINDS) {
    const written: Partial<Record<SearchEntityKind, number>> = {};
    for (const kind of kinds) {
      const startedAt = new Date();
      const [rows] = await this.pool.query<Row[]>(SOURCES[kind].sql);
      for (const row of rows) await this.write(kind, SOURCES[kind].map(row), startedAt);
      await this.pool.execute('DELETE FROM search_metadata WHERE resource_type=? AND indexed_at<?', [kind, startedAt]);
      written[kind] = rows.length;
    }
    return written;
  }

  /** Refresh one record after a change; removes it when the source no longer exists. */
  async indexOne(kind: SearchEntityKind, id: string) {
    const source = SOURCES[kind];
    const alias = { employee: 'e', division: 'divisions', project: 'projects', task: 't', timesheet: 's', remark: 'general_remarks', document: 'd' }[kind];
    const [rows] = await this.pool.query<Row[]>(`${source.sql} WHERE ${alias}.id=?`, [id]);
    if (!rows[0]) {
      await this.pool.execute('DELETE FROM search_metadata WHERE resource_type=? AND resource_id=?', [kind, id]);
      return false;
    }
    await this.write(kind, source.map(rows[0]), new Date());
    return true;
  }

  private async write(kind: SearchEntityKind, entry: IndexEntry, at: Date) {
    await this.pool.execute(
      `INSERT INTO search_metadata(id,resource_type,resource_id,title,safe_text,scope_json,source_version,indexed_at,division_id,project_id,employee_id,status_key,work_location,occurred_on,file_type,is_active)
       VALUES(?,?,?,?,?,JSON_OBJECT(),?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE title=VALUES(title),safe_text=VALUES(safe_text),source_version=VALUES(source_version),indexed_at=VALUES(indexed_at),
         division_id=VALUES(division_id),project_id=VALUES(project_id),employee_id=VALUES(employee_id),status_key=VALUES(status_key),
         work_location=VALUES(work_location),occurred_on=VALUES(occurred_on),file_type=VALUES(file_type),is_active=VALUES(is_active)`,
      [randomUUID(), kind, entry.resourceId, entry.title || '(untitled)', entry.text, entry.version, at, entry.divisionId, entry.projectId, entry.employeeId,
        entry.status, entry.location, entry.occurredOn, entry.fileType, entry.isActive]);
  }
}
