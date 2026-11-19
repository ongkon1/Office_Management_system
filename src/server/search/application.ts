import type { Pool, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import type { SearchEntityKind, SearchOptions, SearchResultView, SearchResultsView } from '@/contracts/workspace';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { divisionReach, documentReach, employeeReach, projectReach, taskReach } from '@/server/authorization/record-access';
import { canOpenRelated } from '@/server/notifications/access';
import { businessDate, guarded, invalid } from '@/server/supporting/results';
import { SEARCH_KINDS } from './indexer';
import { CATEGORY_LABEL, type DocumentCategory } from '@/server/documents/application';

type Row = RowDataPacket & Record<string, unknown>;

export const KIND_LABEL: Readonly<Record<SearchEntityKind, string>> = {
  employee: 'Employees', division: 'Divisions', project: 'Projects', task: 'Tasks', timesheet: 'Timesheets', remark: 'Remarks', document: 'Documents',
};

/** Candidates scanned per search. A bound, not a page size: see `truncated`. */
export const CANDIDATE_LIMIT = 500;
const SNIPPET = 180;

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionsSchema = z.object({
  filters: z.object({
    from: date.optional(), to: date.optional(),
    divisionIds: z.array(uuid).max(20).optional(), employeeIds: z.array(uuid).max(20).optional(), projectIds: z.array(uuid).max(20).optional(),
    statuses: z.array(z.string().regex(/^[a-z_]{1,32}$/)).max(20).optional(),
    workLocations: z.array(z.enum(['office', 'wfh', 'hybrid', 'field_work', 'client_office', 'official_travel', 'training_venue'])).max(7).optional(),
    fileTypes: z.array(z.string().regex(/^[a-z0-9]{1,8}$/)).max(10).optional(),
  }).strict().optional(),
  page: z.number().int().min(1).max(50).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
}).strict();

/**
 * Normalize a search term: compatibility-fold, drop control characters,
 * collapse whitespace. What remains is matched literally — never as SQL, a
 * pattern or markup (`BE-0723`).
 */
export function normalizeTerm(raw: string) {
  return raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
/** Escape LIKE wildcards so `%` and `_` in a term are literal. */
export const likePattern = (term: string) => term.replace(/[\\%_]/g, (character) => `\\${character}`);

function snippet(text: string, term: string) {
  if (!text) return null;
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  const start = Math.max(0, at < 0 ? 0 : at - 60);
  const piece = text.slice(start, start + SNIPPET);
  return `${start > 0 ? '…' : ''}${piece}${start + SNIPPET < text.length ? '…' : ''}`;
}

interface Live { readonly title: string; readonly subtitle: string; readonly text: string; readonly href: string }

/**
 * Authorized global search (`BE-0720`–`BE-0723`, `REQ-SRCH-001`–`003`).
 *
 * The index proposes candidates; it never decides visibility. Each candidate
 * is re-read from its **live** source row and passed through the same reach
 * rule its own screen uses, and the term is matched again against the live
 * text. So a record deleted, moved or restricted since it was indexed is not
 * returned — and because only verified results are counted, grouped or
 * snippeted, `totalCount`, the groups and the snippets reveal nothing the
 * viewer could not open. Work is bounded: at most `CANDIDATE_LIMIT`
 * candidates per search, pages of at most 50.
 */
export class SearchApplication {
  constructor(private readonly pool: Pool, private readonly now = () => new Date().toISOString()) {}

  search(actor: ActorPolicyContext, rawTerm: string, kinds?: readonly SearchEntityKind[], options: SearchOptions = {}): Promise<Result<SearchResultsView>> {
    return guarded(async () => {
      const parsed = optionsSchema.safeParse(options);
      if (!parsed.success) return invalid(String(parsed.error.issues[0].path.join('.') || 'filters'), 'One of the search filters is not valid.', 'Clear the filters and choose them again.');
      const term = normalizeTerm(rawTerm);
      const page = parsed.data.page ?? 1;
      const pageSize = parsed.data.pageSize ?? 20;
      if (!term) return success({ term: '', totalCount: 0, groups: [], guidance: 'Type at least one character to search authorized records.', page: { page, pageSize, hasMore: false, truncated: false } });
      if (term.length > 100) return invalid('term', 'Use a shorter search term.', 'Search for up to 100 characters.');
      const wanted = (kinds?.length ? kinds : SEARCH_KINDS).filter((kind) => SEARCH_KINDS.includes(kind));
      const filters = parsed.data.filters ?? {};
      if (filters.from && filters.to && filters.to < filters.from) return invalid('filters.to', 'The end date is before the start date.', 'Choose an end date on or after the start date.');

      const escaped = likePattern(term);
      const contains = `%${escaped}%`;
      const clauses = [`resource_type IN (${wanted.map(() => '?').join(',')})`, 'is_active=TRUE', "(title LIKE ? ESCAPE '\\\\' OR safe_text LIKE ? ESCAPE '\\\\')"];
      const values: (string | number)[] = [...wanted, contains, contains];
      const inList = (column: string, list?: readonly string[]) => {
        if (!list?.length) return;
        clauses.push(`${column} IN (${list.map(() => '?').join(',')})`);
        values.push(...list);
      };
      if (filters.from) { clauses.push('occurred_on>=?'); values.push(filters.from); }
      if (filters.to) { clauses.push('occurred_on<=?'); values.push(filters.to); }
      inList('division_id', filters.divisionIds);
      inList('employee_id', filters.employeeIds);
      inList('project_id', filters.projectIds);
      inList('status_key', filters.statuses);
      inList('work_location', filters.workLocations);
      inList('file_type', filters.fileTypes);
      const [candidates] = await this.pool.query<Row[]>(
        `SELECT resource_type,resource_id,
           CASE WHEN LOWER(title)=LOWER(?) THEN 3 WHEN title LIKE ? ESCAPE '\\\\' THEN 2 WHEN title LIKE ? ESCAPE '\\\\' THEN 1 ELSE 0 END score
         FROM search_metadata WHERE ${clauses.join(' AND ')}
         ORDER BY score DESC,indexed_at DESC,resource_type,resource_id LIMIT ?`,
        [term, `${escaped}%`, contains, ...values, CANDIDATE_LIMIT]);

      const verified: SearchResultView[] = [];
      const needle = term.toLowerCase();
      for (const candidate of candidates) {
        const kind = String(candidate.resource_type) as SearchEntityKind;
        const id = String(candidate.resource_id);
        const live = await this.live(actor, kind, id);
        // Matched again on live text: a stale index entry cannot pull in a record that no longer matches.
        if (!live || !`${live.title} ${live.text}`.toLowerCase().includes(needle)) continue;
        verified.push({ id, kind, kindLabel: KIND_LABEL[kind], title: live.title, subtitle: live.subtitle, href: live.href, snippet: snippet(live.text, term), isRestricted: false });
      }
      const pageItems = verified.slice((page - 1) * pageSize, page * pageSize);
      const present = SEARCH_KINDS.filter((kind) => pageItems.some((item) => item.kind === kind));
      const truncated = candidates.length >= CANDIDATE_LIMIT;
      return success({
        term,
        totalCount: verified.length,
        groups: present.map((kind) => ({ kind, label: KIND_LABEL[kind], results: pageItems.filter((item) => item.kind === kind) })),
        guidance: verified.length
          ? truncated ? 'Showing the best matches only. Add a word or a filter to narrow the search.' : null
          : 'No results you have access to. Check the spelling or try a shorter term.',
        page: { page, pageSize, hasMore: page * pageSize < verified.length, truncated },
      });
    });
  }

  /** The live record, if this actor may open it; its display text comes from here, never the index. */
  private async live(actor: ActorPolicyContext, kind: SearchEntityKind, id: string): Promise<Live | null> {
    const today = businessDate(this.now());
    const one = async (sql: string) => (await this.pool.execute<Row[]>(sql, [id]))[0][0] ?? null;
    switch (kind) {
      case 'employee': {
        const row = await one("SELECT e.id,e.display_name,e.employee_code,e.job_title FROM employees e JOIN users u ON u.id=e.user_id WHERE e.id=? AND e.status='active' AND u.status='active'");
        if (!row || !(await employeeReach(this.pool, actor, id))) return null;
        return { title: String(row.display_name), subtitle: `${row.employee_code}${row.job_title ? ` · ${row.job_title}` : ''}`, text: `${row.employee_code} ${row.job_title ?? ''}`, href: `/employees/${id}` };
      }
      case 'division': {
        const row = await one('SELECT name,division_key,description FROM divisions WHERE id=? AND is_active=TRUE');
        if (!row || !(await divisionReach(this.pool, actor, id))) return null;
        return { title: String(row.name), subtitle: 'Division', text: `${row.division_key} ${row.description ?? ''}`, href: '/divisions' };
      }
      case 'project': {
        const row = await one('SELECT name,project_code,client_name FROM projects WHERE id=?');
        if (!row || !(await projectReach(this.pool, actor, id, today))) return null;
        return { title: String(row.name), subtitle: String(row.project_code), text: `${row.project_code} ${row.client_name ?? ''}`, href: `/projects/${id}` };
      }
      case 'task': {
        const row = await one('SELECT t.title,t.description,p.project_code FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND t.is_active=TRUE');
        if (!row || !(await taskReach(this.pool, actor, id))) return null;
        return { title: String(row.title), subtitle: `Task · ${row.project_code}`, text: String(row.description ?? ''), href: `/tasks/${id}` };
      }
      case 'timesheet': {
        const row = await one('SELECT s.employee_id,s.work_date,s.classification,e.display_name FROM daily_summaries s JOIN employees e ON e.id=s.employee_id WHERE s.id=?');
        if (!row) return null;
        const workDate = row.work_date instanceof Date ? row.work_date.toISOString().slice(0, 10) : String(row.work_date).slice(0, 10);
        if (!(await employeeReach(this.pool, actor, String(row.employee_id), { date: workDate }))) return null;
        const own = row.employee_id === actor.employeeId;
        return { title: `${row.display_name} · ${workDate}`, subtitle: 'Timesheet', text: `Timesheet ${String(row.classification).replace(/_/g, ' ')}`,
          href: own ? `/timesheets/${workDate}` : `/team/timesheets/${row.employee_id}/${workDate}` };
      }
      case 'remark': {
        const row = await one('SELECT message FROM general_remarks WHERE id=?');
        if (!row || !(await canOpenRelated(this.pool, actor, { type: 'remark', id }, today))) return null;
        return { title: 'General remark', subtitle: 'Remark', text: String(row.message), href: `/remarks/${id}` };
      }
      case 'document': {
        const reach = await documentReach(this.pool, actor, id, today);
        if (!reach?.isActive) return null;
        const row = await one('SELECT title,description,category FROM documents WHERE id=?');
        return row ? { title: String(row.title), subtitle: 'Document', text: `${CATEGORY_LABEL[String(row.category) as DocumentCategory] ?? String(row.category).replace(/_/g, ' ')} ${row.description ?? ''}`, href: '/documents' } : null;
      }
    }
  }
}
