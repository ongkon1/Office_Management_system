import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  DocumentItemView,
  DocumentLibraryView,
  LeaveRequestInput,
  LeaveSelfServiceView,
  MessagePrototypeView,
  NotificationCentreView,
  NotificationGroupKey,
  NotificationItemView,
  SearchEntityKind,
  SearchResultsView,
  SelfEvaluationFormValues,
  SelfEvaluationView,
  SelfRequestView,
  WfhRequestInput,
  WfhSelfServiceView,
  WorkspaceService,
} from '@/contracts/workspace';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatDate, formatDateRange, formatTimestamp } from '@/lib/format';
import { toDurationView } from '@/lib/status';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { reachesEmployee } from '@/server/organization/department-authority';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';

type Row = RowDataPacket & Record<string, unknown>;
type SqlValue = string | number | boolean | Date | null;
const EMPTY_EVALUATION: SelfEvaluationFormValues = {
  achievements: '', completedProjects: '', challenges: '', skills: '', trainingNeeds: '', goals: '', supportRequired: '',
};
const KIND_LABEL: Record<SearchEntityKind, string> = {
  employee: 'Employees', division: 'Divisions', project: 'Projects', task: 'Tasks', timesheet: 'Timesheets', remark: 'Remarks', document: 'Documents',
};
const REQUEST_LABEL: Record<string, string> = {
  draft: 'Draft', submitted: 'Pending', pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
  information_requested: 'Information requested', cancelled: 'Cancelled',
};
const GROUP_LABEL: Record<NotificationGroupKey, string> = {
  action_required: 'Action required', time: 'Time', work: 'Work', requests: 'Requests', evaluation: 'Evaluations', periods: 'Periods', exports: 'Exports',
};

const absent = (resource = 'record'): Result<never> => ({ status: 'not_found', code: 'NOT_FOUND', message: `${resource} was not found.`, resource });
const invalid = (field: string, message: string, guidance: string): Result<never> => ({
  status: 'validation_failure', code: 'VALIDATION_FAILED', message, focusField: field,
  fieldErrors: [{ field, code: 'INVALID_VALUE', message, guidance }],
});
const conflict = (message: string, guidance: string): Result<never> => ({ status: 'conflict', code: 'CONFLICT', message, guidance });
const stringDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const stringInstant = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const json = <T>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  try { return (typeof value === 'string' ? JSON.parse(value) : value) as T; } catch { return fallback; }
};
const requestState = (value: unknown) => {
  const state = String(value);
  return state === 'submitted' ? 'pending' : state as SelfRequestView['state'];
};

interface Viewer {
  readonly userId: string;
  readonly employeeId: string;
  readonly divisionIds: ReadonlySet<string>;
  readonly projectIds: ReadonlySet<string>;
  readonly permissions: ReadonlySet<string>;
  /** `OH-BE-0309`: the full context, so search authorizes like everywhere else. */
  readonly actor: ActorPolicyContext;
}

export class BackendWorkspaceService implements WorkspaceService {
  private readonly auth: AuthenticationService;
  constructor(private readonly pool: Pool, private readonly sessionToken: string) {
    this.auth = new AuthenticationService(new MysqlAuthenticationStore(pool));
  }

  private async viewer(userId: string): Promise<Viewer | null> {
    const session = await this.auth.validateSession(this.sessionToken);
    if (session.status !== 'success' || session.data.userId !== userId) return null;
    const actor = await loadActorPolicyContext(this.pool, userId, new Date().toISOString().slice(0, 10));
    if (!actor?.employeeId) return null;
    return { userId, employeeId: actor.employeeId, divisionIds: actor.divisionIds, projectIds: actor.projectIds, permissions: actor.permissions, actor };
  }

  private notificationGroup(type: string): NotificationGroupKey {
    if (type.includes('export')) return 'exports';
    if (type.includes('period')) return 'periods';
    if (type.includes('evaluation')) return 'evaluation';
    if (type.includes('request') || type.includes('leave') || type.includes('wfh')) return 'requests';
    if (type.includes('time') || type.includes('critical') || type.includes('overtime')) return 'time';
    if (type.includes('task') || type.includes('project')) return 'work';
    return 'action_required';
  }

  private async notificationCentre(userId: string): Promise<Result<NotificationCentreView>> {
    if (!await this.viewer(userId)) return absent('Notifications');
    const [rows] = await this.pool.execute<Row[]>(`SELECT id,notification_type,safe_payload,related_type,related_id,read_at,created_at
      FROM notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 200`, [userId]);
    const items: NotificationItemView[] = rows.map(row => {
      const payload = json<Record<string, unknown>>(row.safe_payload, {});
      const type = String(row.notification_type);
      const group = this.notificationGroup(type);
      return {
        id: String(row.id), type: type as NotificationItemView['type'],
        title: String(payload.title ?? type.replaceAll('_', ' ')), body: String(payload.body ?? payload.message ?? 'Open the related record for details.'),
        createdAtLabel: formatTimestamp(stringInstant(row.created_at)), isRead: Boolean(row.read_at),
        href: typeof payload.href === 'string' ? payload.href : null,
        relatedLabel: typeof payload.relatedLabel === 'string' ? payload.relatedLabel : null,
        group, groupLabel: GROUP_LABEL[group], requiresAction: Boolean(payload.requiresAction ?? group === 'action_required'),
      };
    });
    const groups = ([...new Set(items.map(item => item.group))]).map(key => ({ key, label: GROUP_LABEL[key], items: items.filter(item => item.group === key) }));
    return success({ unreadCount: items.filter(item => !item.isRead).length, groups });
  }

  getNotifications(userId: string) { return this.notificationCentre(userId); }
  async markNotificationRead(userId: string, id: string, isRead: boolean) {
    if (!await this.viewer(userId)) return absent('Notification');
    const [result] = await this.pool.execute<import('mysql2/promise').ResultSetHeader>(
      'UPDATE notifications SET read_at=? WHERE id=? AND recipient_user_id=?', [isRead ? new Date() : null, id, userId],
    );
    if (!result.affectedRows) return absent('Notification');
    return this.notificationCentre(userId);
  }
  async markAllNotificationsRead(userId: string) {
    if (!await this.viewer(userId)) return absent('Notifications');
    await this.pool.execute('UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP(6)) WHERE recipient_user_id=?', [userId]);
    return this.notificationCentre(userId);
  }

  /**
   * `OH-BE-0309`. An indexed row names the scope it belongs to; this decides
   * whether the viewer may see it.
   *
   * Three things are deliberate. A **department-scoped** row is reachable only
   * through an effective appointment for that department, or by HR and a Super
   * Administrator. An **employee-scoped** row is reachable by the same rule
   * every report and notification uses, so a Team Lead finds their own team
   * instead of only themselves. And a **division** that the viewer reaches only
   * through a department appointment still passes, because an appointment never
   * widens `divisionIds` — the department check above is what bounds it.
   */
  private visible(viewer: Viewer, scope: Record<string, unknown>) {
    const divisionId = typeof scope.divisionId === 'string' ? scope.divisionId : null;
    const projectId = typeof scope.projectId === 'string' ? scope.projectId : null;
    const employeeId = typeof scope.employeeId === 'string' ? scope.employeeId : null;
    const departmentId = typeof scope.departmentId === 'string' ? scope.departmentId : null;
    const wide = viewer.actor.roles.includes('hr_manager') || viewer.actor.roles.includes('super_admin');
    if (departmentId && !wide && !(viewer.actor.departmentIds?.has(departmentId) ?? false)) return false;
    if (divisionId && !viewer.divisionIds.has(divisionId) && !wide
      && !(departmentId && (viewer.actor.departmentIds?.has(departmentId) ?? false))) return false;
    if (projectId && !viewer.projectIds.has(projectId) && !wide) return false;
    if (employeeId && !reachesEmployee(viewer.actor, { employeeId, divisionId: divisionId ?? undefined })) return false;
    if (scope.government === true && !viewer.permissions.has('government.view')) return false;
    return true;
  }

  async search(userId: string, term: string, kinds?: readonly SearchEntityKind[]): Promise<Result<SearchResultsView>> {
    const viewer = await this.viewer(userId); if (!viewer) return absent('Search');
    const trimmed = term.trim();
    if (!trimmed) return success({ term: '', totalCount: 0, groups: [], guidance: 'Type at least one character to search authorized records.' });
    const [preferences]=await this.pool.execute<Row[]>('SELECT recent_searches FROM user_preferences WHERE user_id=?',[userId]);
    const recent=json<string[]>(preferences[0]?.recent_searches,[]);
    const next=[trimmed,...recent.filter(value=>value!==trimmed)].slice(0,5);
    await this.pool.execute(`INSERT INTO user_preferences(user_id,recent_searches) VALUES(?,?) ON DUPLICATE KEY UPDATE recent_searches=VALUES(recent_searches),version=version+1`,[userId,JSON.stringify(next)]);
    const pattern = `%${trimmed.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const [rows] = await this.pool.execute<Row[]>(`SELECT resource_type,resource_id,title,safe_text,scope_json FROM search_metadata
      WHERE (title LIKE ? ESCAPE '\\\\' OR safe_text LIKE ? ESCAPE '\\\\') ORDER BY indexed_at DESC LIMIT 100`, [pattern, pattern]);
    const results = rows.flatMap(row => {
      const kind = String(row.resource_type) as SearchEntityKind;
      if (!Object.hasOwn(KIND_LABEL, kind) || (kinds?.length && !kinds.includes(kind))) return [];
      if (!this.visible(viewer, json<Record<string, unknown>>(row.scope_json, {}))) return [];
      const id = String(row.resource_id);
      const href: Record<SearchEntityKind, string> = { employee:`/employees/${id}`,division:`/divisions/${id}`,project:`/projects/${id}`,task:`/tasks/${id}`,timesheet:`/timesheets/${id}`,remark:`/remarks/${id}`,document:'/documents' };
      return [{ id, kind, kindLabel: KIND_LABEL[kind], title: String(row.title), subtitle: String(row.safe_text ?? ''), href: href[kind], snippet: row.safe_text ? String(row.safe_text).slice(0, 180) : null, isRestricted: false }];
    });
    const present = [...new Set(results.map(item => item.kind))];
    return success({ term: trimmed, totalCount: results.length, groups: present.map(kind => ({ kind, label: KIND_LABEL[kind], results: results.filter(item => item.kind === kind) })), guidance: results.length ? null : 'No results you have access to. Check the spelling or try a shorter term.' });
  }
  async listRecentSearches(userId: string) { if(!await this.viewer(userId))return absent('Search');const [rows]=await this.pool.execute<Row[]>('SELECT recent_searches FROM user_preferences WHERE user_id=?',[userId]);return success<readonly string[]>(json<string[]>(rows[0]?.recent_searches,[])); }

  async getDocuments(userId: string, filters?: { readonly term?: string; readonly scopes?: readonly string[] }): Promise<Result<DocumentLibraryView>> {
    const viewer = await this.viewer(userId); if (!viewer) return absent('Document library');
    const values: SqlValue[] = [];
    let where = 'd.is_active=TRUE';
    if (filters?.term?.trim()) { where += ' AND (d.title LIKE ? OR a.original_name LIKE ?)'; const p=`%${filters.term.trim()}%`; values.push(p,p); }
    if (filters?.scopes?.length) { where += ` AND d.scope_type IN (${filters.scopes.map(()=>'?').join(',')})`; values.push(...filters.scopes); }
    const [rows] = await this.pool.execute<Row[]>(`SELECT d.id,d.title,d.scope_type,d.division_id,d.project_id,d.sensitivity,d.created_at,d.version,
      dv.name division_name,p.name project_name,p.project_code,a.original_name,a.media_type,a.size_bytes,u.name uploader
      FROM documents d LEFT JOIN divisions dv ON dv.id=d.division_id LEFT JOIN projects p ON p.id=d.project_id
      LEFT JOIN document_versions v ON v.document_id=d.id AND v.version_number=(SELECT MAX(v2.version_number) FROM document_versions v2 WHERE v2.document_id=d.id)
      LEFT JOIN attachments a ON a.id=v.attachment_id LEFT JOIN users u ON u.id=v.created_by_user_id WHERE ${where} ORDER BY d.updated_at DESC`, values);
    const items: DocumentItemView[] = rows.flatMap(row => {
      const divisionId = row.division_id ? String(row.division_id) : null, projectId = row.project_id ? String(row.project_id) : null;
      if ((divisionId && !viewer.divisionIds.has(divisionId)) || (projectId && !viewer.projectIds.has(projectId))) return [];
      const restricted = String(row.sensitivity) === 'government' && !viewer.permissions.has('government.view');
      const scope = String(row.scope_type) as DocumentItemView['scope'];
      const size = Number(row.size_bytes ?? 0);
      const groupLabel = scope === 'company' ? 'Company documents' : scope === 'division' ? String(row.division_name ?? 'Division') : String(row.project_name ?? 'Project');
      return [{ id:String(row.id),title:String(row.title),description:null,scope,scopeLabel:scope === 'company' ? 'Company' : `${scope === 'division' ? 'Division' : 'Project'}: ${groupLabel}`,groupLabel,
        version:String(row.version),fileName:String(row.original_name ?? 'File unavailable'),mediaTypeLabel:String(row.media_type ?? 'Unknown'),sizeLabel:size >= 1_000_000 ? `${(size/1_000_000).toFixed(1)} MB` : `${Math.ceil(size/1000)} KB`,
        uploadedAtLabel:formatTimestamp(stringInstant(row.created_at)),uploadedByLabel:String(row.uploader ?? 'System'),isRestricted:restricted,
        restrictionReason:restricted?'This document requires government-project access.':null,canDownload:!restricted,
        previewPlaceholder:`Preview of ${String(row.original_name ?? row.title)} is not available.` }];
    });
    const labels=[...new Set(items.map(item=>item.groupLabel))];
    return success({ groups:labels.map(label=>({key:label,label,scope:items.find(item=>item.groupLabel===label)!.scope,documents:items.filter(item=>item.groupLabel===label)})),totalCount:items.length,restrictedCount:items.filter(item=>item.isRestricted).length });
  }
  async downloadDocument(userId: string, id: string) {
    const library=await this.getDocuments(userId); if(library.status!=='success') return library;
    const item=library.data.groups.flatMap(group=>group.documents).find(document=>document.id===id);
    if(!item)return absent('Document'); if(!item.canDownload)return {status:'permission_denied' as const,code:'FORBIDDEN' as const,message:'You cannot download this document.',requiredPermission:'government.view'};
    return success({note:`Authorized download: ${item.fileName}. The signed storage URL is issued by the document delivery boundary.`});
  }

  async getMessages(userId: string): Promise<Result<MessagePrototypeView>> {
    const viewer=await this.viewer(userId);if(!viewer)return absent('Messages');
    const [rows]=await this.pool.execute<Row[]>(`SELECT m.id,m.scope_type,m.scope_id,m.body,m.created_at,m.sender_user_id,u.name sender_name,
      COALESCE(d.name,p.name,'Direct conversation') scope_name FROM messages m JOIN users u ON u.id=m.sender_user_id
      LEFT JOIN divisions d ON m.scope_type='division' AND d.id=m.scope_id LEFT JOIN projects p ON m.scope_type='project' AND p.id=m.scope_id
      ORDER BY m.created_at`,[]);
    const visible=rows.filter(row=>row.scope_type==='direct' ? String(row.scope_id)===userId||String(row.sender_user_id)===userId : row.scope_type==='division'?viewer.divisionIds.has(String(row.scope_id)):viewer.projectIds.has(String(row.scope_id)));
    const scopes=[...new Set(visible.map(row=>`${row.scope_type}:${row.scope_id}`))];
    return success({threads:scopes.map(key=>{const thread=visible.filter(row=>`${row.scope_type}:${row.scope_id}`===key);const first=thread[0];const kind=String(first.scope_type) as 'division'|'project'|'direct';return{id:key,kind,kindLabel:kind==='division'?'Division channel':kind==='project'?'Project channel':'Direct message',title:String(first.scope_name),subtitle:'Authorized conversation',lastMessageAtLabel:formatTimestamp(stringInstant(thread.at(-1)!.created_at)),unreadCount:0,messages:thread.map(row=>({id:String(row.id),authorName:String(row.sender_name),body:String(row.body),atLabel:formatTimestamp(stringInstant(row.created_at)),isOwn:String(row.sender_user_id)===userId}))};}),prototypeNote:'Messages are stored and shown only within the signed-in user\'s authorized scope.',deliveryPhaseLabel:'Server-backed workspace'});
  }

  private async requestRows(viewer: Viewer, kind: 'wfh'|'leave'): Promise<SelfRequestView[]> {
    const sql=kind==='wfh'?`SELECT r.*,NULL leave_type,NULL leave_name,r.wfh_date start_date,r.wfh_date end_date,r.planned_tasks detail FROM wfh_requests r WHERE r.employee_id=?`:
      `SELECT r.*,lt.type_key leave_type,lt.name leave_name,r.reason detail FROM leave_requests r JOIN leave_types lt ON lt.id=r.leave_type_id WHERE r.employee_id=?`;
    const [rows]=await this.pool.execute<Row[]>(`${sql} ORDER BY start_date DESC`,[viewer.employeeId]);
    return rows.map(row=>{const state=requestState(row.status),start=stringDate(row.start_date),end=stringDate(row.end_date),portion=String(row.portion) as SelfRequestView['portion'];return{id:String(row.id),kind,dateLabel:start===end?formatDate(start):formatDateRange(start,end),startDate:start,endDate:end,portion,portionLabel:portion==='half_day'?'Half day':'Full day',leaveType:row.leave_type as SelfRequestView['leaveType'],leaveTypeLabel:row.leave_name?String(row.leave_name):null,reason:String(row.reason),detail:String(row.detail??''),state,stateLabel:REQUEST_LABEL[state]??state,decisionLabel:row.decision_comment?String(row.decision_comment):null,decisionComment:row.decision_comment?String(row.decision_comment):null,overrideNote:json<Record<string,unknown>>(row.payload,{}).overrideReason as string??null,nextStep:state==='information_requested'?'Update the request or contact your Team Lead.':null,canCancel:state==='pending'||state==='information_requested',canRespond:state==='information_requested',conflictNote:null};});
  }

  async getWfhSelfService(userId: string): Promise<Result<WfhSelfServiceView>> {
    const viewer=await this.viewer(userId);if(!viewer)return absent('Requests');const requests=await this.requestRows(viewer,'wfh');
    const [divisions]=await this.pool.execute<Row[]>(`SELECT DISTINCT d.id,d.name FROM employee_division_assignments a JOIN divisions d ON d.id=a.division_id WHERE a.employee_id=? AND a.is_active=TRUE AND a.effective_from<=CURRENT_DATE AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE) ORDER BY d.name`,[viewer.employeeId]);
    const today=new Date().toISOString().slice(0,10);return success({requests,approvedUpcoming:requests.filter(item=>item.state==='approved'&&item.startDate>=today),divisionOptions:divisions.map(row=>({value:String(row.id),label:String(row.name)})),canRequest:true,disabledReason:null});
  }
  async submitWfhRequest(userId: string,input:WfhRequestInput){const viewer=await this.viewer(userId);if(!viewer)return absent('Requests');if(!input.reason.trim())return invalid('reason','Give a reason for the request.','Say why you need to work from home.');if(!input.plannedTasks.trim())return invalid('plannedTasks','List the work you plan to do.','Name the tasks or deliverables.');
    const [duplicate]=await this.pool.execute<Row[]>("SELECT id,status FROM wfh_requests WHERE employee_id=? AND wfh_date=? AND status NOT IN ('cancelled','rejected') LIMIT 1",[viewer.employeeId,input.wfhDate]);if(duplicate[0])return conflict('You already have a request for this date.','Cancel the existing request before submitting another.');
    const id=randomUUID();await this.pool.execute(`INSERT INTO wfh_requests(id,employee_id,division_id,wfh_date,portion,reason,planned_tasks,contact_availability,status,payload) VALUES(?,?,?,?,?,?,?,?,?,JSON_OBJECT())`,[id,viewer.employeeId,input.divisionId,input.wfhDate,input.portion,input.reason.trim(),input.plannedTasks.trim(),input.contactAvailability.trim(),'submitted']);const rows=await this.requestRows(viewer,'wfh');return success(rows.find(row=>row.id===id)!);}
  async cancelRequest(userId:string,kind:'wfh'|'leave',id:string){const viewer=await this.viewer(userId);if(!viewer)return absent('Request');const table=kind==='wfh'?'wfh_requests':'leave_requests';const [rows]=await this.pool.execute<Row[]>(`SELECT status FROM ${table} WHERE id=? AND employee_id=?`,[id,viewer.employeeId]);if(!rows[0])return absent('Request');if(!['submitted','information_requested','draft'].includes(String(rows[0].status)))return conflict(`A ${REQUEST_LABEL[String(rows[0].status)]?.toLowerCase()??'decided'} request cannot be cancelled.`,'Contact your Team Lead if the decision needs to change.');await this.pool.execute(`UPDATE ${table} SET status='cancelled',version=version+1 WHERE id=? AND employee_id=?`,[id,viewer.employeeId]);const all=await this.requestRows(viewer,kind);return success(all.find(row=>row.id===id)!);}

  async getLeaveSelfService(userId:string):Promise<Result<LeaveSelfServiceView>>{const viewer=await this.viewer(userId);if(!viewer)return absent('Leave');const requests=await this.requestRows(viewer,'leave');const [rows]=await this.pool.execute<Row[]>(`SELECT lt.type_key,lt.name,lt.allows_half_day,COALESCE(lb.entitled_minutes,0) entitled,COALESCE(lb.used_minutes,0) used,COALESCE(lb.reserved_minutes,0) reserved,COALESCE(lb.unit_minutes,420) unit FROM leave_types lt LEFT JOIN leave_balances lb ON lb.leave_type_id=lt.id AND lb.employee_id=? AND lb.year=YEAR(CURRENT_DATE) WHERE lt.is_active=TRUE ORDER BY lt.name`,[viewer.employeeId]);const options=rows.map(row=>({value:String(row.type_key) as LeaveSelfServiceView['leaveTypeOptions'][number]['value'],label:String(row.name),allowsHalfDay:Boolean(row.allows_half_day),remainingDays:(Number(row.entitled)-Number(row.used)-Number(row.reserved))/Number(row.unit)}));return success({balances:rows.map(row=>({typeLabel:String(row.name),entitledDays:Number(row.entitled)/Number(row.unit),consumedDays:Number(row.used)/Number(row.unit),remainingDays:(Number(row.entitled)-Number(row.used)-Number(row.reserved))/Number(row.unit)})),requests,leaveTypeOptions:options,canRequest:true,disabledReason:null});}
  async submitLeaveRequest(userId:string,input:LeaveRequestInput){const viewer=await this.viewer(userId);if(!viewer)return absent('Leave');if(!input.reason.trim())return invalid('reason','Give a reason for the leave.','A short reason is enough.');if(input.endDate<input.startDate)return invalid('endDate','The end date cannot be before the start date.','Choose an end date on or after the start date.');if(input.portion==='half_day'&&input.startDate!==input.endDate)return invalid('portion','A half day covers one date.','Use the same start and end date.');const [types]=await this.pool.execute<Row[]>('SELECT id,allows_half_day FROM leave_types WHERE type_key=? AND is_active=TRUE',[input.leaveType]);if(!types[0])return invalid('leaveType','Choose an active leave type.','Select a leave type from the list.');if(input.portion==='half_day'&&!types[0].allows_half_day)return invalid('portion','This leave type does not allow half days.','Choose a full day.');const [days]=await this.pool.execute<Row[]>('SELECT DATEDIFF(?,?)+1 days',[input.endDate,input.startDate]);const requested=input.portion==='half_day'?210:Number(days[0].days)*420;const [balances]=await this.pool.execute<Row[]>('SELECT entitled_minutes-used_minutes-reserved_minutes remaining FROM leave_balances WHERE employee_id=? AND leave_type_id=? AND year=YEAR(?)',[viewer.employeeId,types[0].id,input.startDate]);if(balances[0]&&requested>Number(balances[0].remaining))return conflict('The request exceeds the remaining balance.','Shorten the request or choose another leave type.');const id=randomUUID();await this.pool.execute(`INSERT INTO leave_requests(id,employee_id,leave_type_id,start_date,end_date,portion,requested_minutes,reason,status,payload) VALUES(?,?,?,?,?,?,?,?,?,JSON_OBJECT())`,[id,viewer.employeeId,types[0].id,input.startDate,input.endDate,input.portion,requested,input.reason.trim(),'submitted']);const rows=await this.requestRows(viewer,'leave');return success(rows.find(row=>row.id===id)!);}

  async getSelfEvaluation(userId:string):Promise<Result<SelfEvaluationView>>{const viewer=await this.viewer(userId);if(!viewer)return absent('Evaluation');const [rows]=await this.pool.execute<Row[]>(`SELECT e.id,e.status,e.payload,e.final_score,e.published_at,p.label,p.start_date,p.end_date,p.payload period_payload,r.answers,r.submitted_at,r.summary FROM evaluations e JOIN evaluation_periods p ON p.id=e.period_id LEFT JOIN evaluation_responses r ON r.evaluation_id=e.id AND r.response_type='self' WHERE e.employee_id=? ORDER BY p.end_date DESC LIMIT 1`,[viewer.employeeId]);if(!rows[0])return success({id:'none',periodLabel:'No open evaluation period',rangeLabel:'—',dueDateLabel:'—',status:'not_open',statusLabel:'No evaluation period open',statusExplanation:'You are not assigned to an evaluation period yet.',values:EMPTY_EVALUATION,submittedAtLabel:null,isEditable:false,published:null,facts:[]});const row=rows[0],values={...EMPTY_EVALUATION,...json<Partial<SelfEvaluationFormValues>>(row.answers,{})},published=String(row.status)==='published',submitted=Boolean(row.submitted_at),status:SelfEvaluationView['status']=published?'published':submitted?'with_reviewer':Object.values(values).some(Boolean)?'self_evaluation_draft':'awaiting_self_evaluation';const periodPayload=json<Record<string,unknown>>(row.period_payload,{});const [facts]=await this.pool.execute<Row[]>('SELECT COALESCE(SUM(active_minutes),0) active,COALESCE(SUM(break_minutes),0) breaks,COALESCE(SUM(GREATEST(total_minutes-480,0)),0) overtime,SUM(classification=\'complete\') complete_days,SUM(classification=\'missing\') missing_days FROM daily_summaries WHERE employee_id=? AND work_date BETWEEN ? AND ?',[viewer.employeeId,row.start_date,row.end_date]);return success({id:String(row.id),periodLabel:String(row.label),rangeLabel:formatDateRange(stringDate(row.start_date),stringDate(row.end_date)),dueDateLabel:periodPayload.dueDate?formatDate(String(periodPayload.dueDate)):formatDate(stringDate(row.end_date)),status,statusLabel:published?'Published':submitted?'With your reviewer':status==='self_evaluation_draft'?'Draft saved':'Awaiting your self-evaluation',statusExplanation:published?'HR has published this evaluation.':submitted?'Your self-evaluation is with your reviewer.':'Complete and submit your self-evaluation.',values,submittedAtLabel:row.submitted_at?formatTimestamp(stringInstant(row.submitted_at)):null,isEditable:!published&&!submitted,published:published?{weightedScore:Number(row.final_score??0),reviewerSummary:String(row.summary??''),publishedAtLabel:row.published_at?formatTimestamp(stringInstant(row.published_at)):'—',areas:[]}:null,facts:[{label:'Active work',value:toDurationView(Number(facts[0]?.active??0)).display},{label:'Recognized break',value:toDurationView(Number(facts[0]?.breaks??0)).display},{label:'Overtime',value:toDurationView(Number(facts[0]?.overtime??0)).display},{label:'Complete days',value:String(facts[0]?.complete_days??0)},{label:'Missing days',value:String(facts[0]?.missing_days??0)}]});}
  async saveSelfEvaluation(userId:string,values:SelfEvaluationFormValues,submit:boolean){const viewer=await this.viewer(userId);if(!viewer)return absent('Evaluation');if(submit&&!values.achievements.trim())return invalid('achievements','Describe at least your key achievements before submitting.','A draft can be saved empty.');const [rows]=await this.pool.execute<Row[]>('SELECT id,status FROM evaluations WHERE employee_id=? ORDER BY created_at DESC LIMIT 1',[viewer.employeeId]);if(!rows[0])return absent('Evaluation');if(String(rows[0].status)==='published')return conflict('This evaluation has been published and cannot be changed.','Contact HR if the published result is wrong.');await this.pool.execute(`INSERT INTO evaluation_responses(id,evaluation_id,respondent_employee_id,response_type,answers,submitted_at) VALUES(?,?,?,'self',?,?) ON DUPLICATE KEY UPDATE answers=VALUES(answers),submitted_at=VALUES(submitted_at),version=version+1`,[randomUUID(),rows[0].id,viewer.employeeId,JSON.stringify(values),submit?new Date():null]);if(submit)await this.pool.execute("UPDATE evaluations SET status='self_submitted',version=version+1 WHERE id=?",[rows[0].id]);return this.getSelfEvaluation(userId);}
}
