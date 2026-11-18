import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  DocumentLibraryView,
  LeaveRequestInput,
  LeaveSelfServiceView,
  MessagePrototypeView,
  NotificationCentreView,
  NotificationGroupKey,
  NotificationItemView,
  SearchEntityKind,
  SearchOptions,
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
import { canOpenRelated } from '@/server/notifications/access';
import { NOTIFICATION_TEMPLATES, canonicalType, hrefFor, relatedFromStored } from '@/server/notifications/catalogue';
import { SearchApplication } from '@/server/search/application';
import { SearchIndexer } from '@/server/search/indexer';
import { DocumentApplication } from '@/server/documents/application';
import { FileApplication } from '@/server/files/application';
import { objectStoreFromEnvironment } from '@/server/files/storage';
import { scannerFromEnvironment } from '@/server/files/scanner';
import { MessageApplication } from '@/server/messages/application';
import { businessDate } from '@/server/supporting/results';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';

type Row = RowDataPacket & Record<string, unknown>;
const EMPTY_EVALUATION: SelfEvaluationFormValues = {
  achievements: '', completedProjects: '', challenges: '', skills: '', trainingNeeds: '', goals: '', supportRequired: '',
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

  /**
   * `BE-0701`, `BE-0705`. Text comes from the catalogue, never the row, so a
   * stored payload cannot carry more than the fixed template. Each link is
   * offered only if the recipient can still open the related record today —
   * a notification about something they have since lost access to stays
   * readable, with no way into the record.
   */
  private async notificationCentre(userId: string): Promise<Result<NotificationCentreView>> {
    const viewer = await this.viewer(userId);
    if (!viewer) return absent('Notifications');
    const [rows] = await this.pool.execute<Row[]>(`SELECT id,notification_type,safe_payload,related_type,related_id,read_at,created_at
      FROM notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 200`, [userId]);
    const date = businessDate();
    const opened = new Map<string, boolean>();
    const items: NotificationItemView[] = [];
    for (const row of rows) {
      const type = canonicalType(String(row.notification_type));
      if (!type) continue;
      const template = NOTIFICATION_TEMPLATES[type];
      const payload = json<{ relatedDate?: string | null }>(row.safe_payload, {});
      const related = relatedFromStored(row.related_type ? String(row.related_type) : null, row.related_id ? String(row.related_id) : null, payload.relatedDate ?? null);
      const key = related ? JSON.stringify(related) : '';
      if (related && !opened.has(key)) opened.set(key, await canOpenRelated(this.pool, viewer.actor, related, date));
      const canOpen = Boolean(related) && opened.get(key) === true;
      items.push({
        id: String(row.id), type, title: template.title,
        body: canOpen || !related ? template.body : `${template.body} You no longer have access to the related record.`,
        createdAtLabel: formatTimestamp(stringInstant(row.created_at)), isRead: Boolean(row.read_at),
        href: canOpen ? hrefFor(related!, viewer.employeeId) : null,
        relatedLabel: payload.relatedDate ? formatDate(payload.relatedDate) : null,
        group: template.group, groupLabel: GROUP_LABEL[template.group], requiresAction: template.requiresAction && canOpen,
      });
    }
    const order: readonly NotificationGroupKey[] = ['action_required', 'time', 'work', 'requests', 'evaluation', 'periods', 'exports'];
    const groups = order.filter((key) => items.some((item) => item.group === key)).map((key) => ({ key, label: GROUP_LABEL[key], items: items.filter((item) => item.group === key) }));
    return success({ unreadCount: items.filter((item) => !item.isRead).length, groups });
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
   * `BE-0720`–`BE-0723`. Delegates to the authorized search service, which
   * re-verifies every candidate against its live record — the index's stored
   * scope is never trusted (the earlier `OH-BE-0309` filter read it).
   */
  async search(userId: string, term: string, kinds?: readonly SearchEntityKind[], options?: SearchOptions): Promise<Result<SearchResultsView>> {
    const viewer = await this.viewer(userId); if (!viewer) return absent('Search');
    const trimmed = term.trim();
    if (trimmed) {
      const [preferences]=await this.pool.execute<Row[]>('SELECT recent_searches FROM user_preferences WHERE user_id=?',[userId]);
      const recent=json<string[]>(preferences[0]?.recent_searches,[]);
      const next=[trimmed.slice(0, 100),...recent.filter(value=>value!==trimmed)].slice(0,5);
      await this.pool.execute(`INSERT INTO user_preferences(user_id,recent_searches) VALUES(?,?) ON DUPLICATE KEY UPDATE recent_searches=VALUES(recent_searches),version=version+1`,[userId,JSON.stringify(next)]);
    }
    return new SearchApplication(this.pool).search(viewer.actor, term, kinds, options);
  }
  async listRecentSearches(userId: string) { if(!await this.viewer(userId))return absent('Search');const [rows]=await this.pool.execute<Row[]>('SELECT recent_searches FROM user_preferences WHERE user_id=?',[userId]);return success<readonly string[]>(json<string[]>(rows[0]?.recent_searches,[])); }

  private documents() {
    return new DocumentApplication(this.pool, new FileApplication(this.pool, objectStoreFromEnvironment(), scannerFromEnvironment()),
      undefined, (id) => new SearchIndexer(this.pool).indexOne('document', id).then(() => undefined));
  }

  /** `BE-0713`, `BE-0715`. Only documents the viewer can read are listed, grouped or counted. */
  async getDocuments(userId: string, filters?: { readonly term?: string; readonly scopes?: readonly string[] }): Promise<Result<DocumentLibraryView>> {
    const viewer = await this.viewer(userId); if (!viewer) return absent('Document library');
    const library = await this.documents().library(viewer.actor, filters);
    if (library.status !== 'success') return library;
    const items = library.data;
    const labels = [...new Set(items.map((item) => item.groupLabel))];
    return success({ groups: labels.map((label) => ({ key: label, label, scope: items.find((item) => item.groupLabel === label)!.scope, documents: items.filter((item) => item.groupLabel === label) })), totalCount: items.length, restrictedCount: 0 });
  }
  /** The authenticated route performs the download and its audit; this confirms access first. */
  async downloadDocument(userId: string, id: string): Promise<Result<{ readonly note: string; readonly href?: string }>> {
    const viewer = await this.viewer(userId); if (!viewer) return absent('Document');
    const document = await this.documents().get(viewer.actor, id);
    if (document.status !== 'success') return document;
    if (!document.data.isActive || document.data.currentVersion === 0) return conflict('This document has no published version yet.', 'Ask its owner to add a file or link.');
    return success({ note: `Downloading ${document.data.title}.`, href: `/api/documents?download=${encodeURIComponent(id)}` });
  }

  /** `BE-0714`. Answers with an empty, explained view while messaging is switched off. */
  async getMessages(userId: string): Promise<Result<MessagePrototypeView>> {
    const viewer = await this.viewer(userId); if (!viewer) return absent('Messages');
    return new MessageApplication(this.pool).threads(viewer.actor);
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
