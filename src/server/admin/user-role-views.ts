import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  AdminService,
  AuditFilters,
  AuditLogView,
  BrandLogoAsset,
  DivisionAdminView,
  DivisionFormInput,
  EmployeeAccessRole,
  IntegrationPlaceholderView,
  NotificationSettingView,
  OrganizationBrandingView,
  RoleAdminView,
  UserAdminView,
  WorkPolicySettingsView,
} from '@/contracts/admin';
import type { PermissionKey, RoleKey, StoredRoleKey } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatDate, formatTimestamp } from '@/lib/format';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { AuditWriter, MysqlAuditSink } from '@/server/audit/writer';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';

interface UserRow extends RowDataPacket {
  user_id: string; employee_id: string; employee_code: string; display_name: string; job_title:string|null; image_url:string|null;
  email: string; status: UserAdminView['status']; two_factor_enabled: number;
  last_login_at: Date | null; role_key: StoredRoleKey | null;
}
interface DivisionRow extends RowDataPacket { user_id: string; id: string; name: string; code: string; restricted: number }
interface PermissionRow extends RowDataPacket { role_key: StoredRoleKey; permission_key: string; name: string; sensitivity: string; granted: number }
interface RoleRow extends RowDataPacket { id: string; role_key: StoredRoleKey; name: string; is_active: number; user_count: number }

const ROLE_LABEL: Readonly<Record<StoredRoleKey, string>> = {
  super_admin: 'Super Administrator', team_lead: 'Team Lead', employee: 'Employee',
  hr_manager: 'HR Manager', management: 'Management / View-Only',
  finance_manager: 'Finance Manager (retired)',
};
const ROLE_DESCRIPTION: Readonly<Record<StoredRoleKey, string>> = {
  super_admin: 'System administration, organization configuration and protected oversight.',
  team_lead: 'Employee self-service plus authorized team, task and exception management.',
  employee: 'Personal tasks, work logs, requests and profile self-service.',
  hr_manager: 'Employee, attendance, request, evaluation and reporting administration.',
  management: 'Read-only operational and management reporting.',
  finance_manager: 'Historical role retained only so recorded decisions remain readable.',
};
const ROLE_SCOPE: Readonly<Record<StoredRoleKey, string>> = {
  super_admin: 'All authorized organization records', team_lead: 'Effective assigned team scope',
  employee: 'Own records', hr_manager: 'Authorized HR scope', management: 'Authorized read-only scope',
  finance_manager: 'Historical role only',
};
const assignable = new Set<StoredRoleKey>(['employee', 'team_lead', 'hr_manager']);
const managedRoles = ['employee', 'team_lead', 'hr_manager'] as const;

const denied = (): Result<never> => ({ status: 'permission_denied', code: 'FORBIDDEN', message: 'Only a Super Administrator can manage users and roles.' });
const absent = (): Result<never> => ({ status: 'not_found', code: 'NOT_FOUND', message: 'record was not found.', resource: 'record' });
const conflict = (message: string, guidance: string): Result<never> => ({ status: 'conflict', code: 'CONFLICT', message, guidance });
const invalid = (field: string, message: string, guidance: string): Result<never> => ({ status: 'validation_failure', code: 'VALIDATION_FAILED', message, focusField: field, fieldErrors: [{ field, code: 'INVALID_VALUE', message, guidance }] });

export class BackendUserRoleAdmin implements AdminService {
  private readonly auth: AuthenticationService;
  private readonly audit: AuditWriter;
  constructor(private readonly pool: Pool, private readonly sessionToken: string) {
    this.auth = new AuthenticationService(new MysqlAuthenticationStore(pool));
    this.audit = new AuditWriter(new MysqlAuditSink(pool));
  }

  private async actor() {
    const session = await this.auth.validateSession(this.sessionToken);
    if (session.status !== 'success') return null;
    return loadActorPolicyContext(this.pool, session.data.userId, new Date().toISOString().slice(0, 10));
  }
  private async administrator(userId: string) {
    const actor = await this.actor();
    return actor?.userId === userId && actor.roles.includes('super_admin') ? actor : null;
  }

  private async authenticated(userId:string){const actor=await this.actor();return actor?.userId===userId?actor:null;}

  async getBranding(userId:string):Promise<Result<OrganizationBrandingView>>{if(!await this.authenticated(userId))return absent();const [rows]=await this.pool.execute<(RowDataPacket&{logo_payload:unknown})[]>('SELECT logo_payload FROM organization_branding WHERE id=1');const value=rows[0]?.logo_payload;const logo=value?(typeof value==='string'?JSON.parse(value):value) as BrandLogoAsset:null;return success({productName:'PowerInAI',logo});}
  async updateBranding(userId:string,logo:BrandLogoAsset|null){const actor=await this.administrator(userId);if(!actor)return denied();if(logo){if(!['image/png','image/jpeg','image/webp'].includes(logo.mediaType))return invalid('logo','Choose a PNG, JPEG, or WebP logo.','Convert the image and try again.');if(!Number.isSafeInteger(logo.sizeBytes)||logo.sizeBytes<=0||logo.sizeBytes>1_048_576)return invalid('logo','The logo must be no larger than 1 MB.','Compress or resize the image.');if(!logo.dataUrl.startsWith(`data:${logo.mediaType};base64,`))return invalid('logo','The selected logo could not be read safely.','Choose the original image file again.');}await this.pool.execute('UPDATE organization_branding SET logo_payload=?,updated_by_user_id=?,version=version+1 WHERE id=1',[logo?JSON.stringify(logo):null,userId]);await this.audit.append({actorUserId:actor.userId,action:'branding.updated',resourceType:'organization_branding',resourceId:null,scope:{},correlationId:randomUUID(),before:'protected',after:logo?{fileName:logo.fileName}:null});return this.getBranding(userId);}

  private async divisionViews():Promise<readonly DivisionAdminView[]>{const [rows]=await this.pool.execute<(RowDataPacket&Record<string,unknown>)[]>(`SELECT d.id,d.name,d.division_key,d.description,d.team_lead_employee_id,d.is_active,d.is_government,
    (SELECT COUNT(*) FROM employee_division_assignments a WHERE a.division_id=d.id AND a.is_active=TRUE AND a.effective_from<=CURRENT_DATE AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE)) assignment_count,
    (SELECT COUNT(*) FROM projects p WHERE p.division_id=d.id AND p.is_active=TRUE) project_count,
    (SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.division_id=d.id AND t.is_active=TRUE AND t.status<>'completed') task_count,
    e.id lead_id,e.employee_code lead_code,e.display_name lead_name,e.job_title lead_title,u.image_url lead_image
    FROM divisions d LEFT JOIN employees e ON e.id=d.team_lead_employee_id LEFT JOIN users u ON u.id=e.user_id ORDER BY d.name`);return rows.map(row=>{const assignments=Number(row.assignment_count),projects=Number(row.project_count),tasks=Number(row.task_count);const blockers=[...(assignments?[`${assignments} active employee assignment(s).`]:[]),...(projects?[`${projects} active project(s).`]:[]),...(tasks?[`${tasks} open task(s).`]:[])];return{id:String(row.id),name:String(row.name),code:String(row.division_key),description:row.description?String(row.description):null,teamLead:row.lead_id?{id:String(row.lead_id),employeeCode:String(row.lead_code),fullName:String(row.lead_name),designation:row.lead_title?String(row.lead_title):null,avatarUrl:row.lead_image?String(row.lead_image):null}:null,isActive:Boolean(row.is_active),isRestricted:Boolean(row.is_government),activeAssignmentCount:assignments,activeProjectCount:projects,openTaskCount:tasks,deactivationBlockers:blockers};});}
  async listDivisions(userId:string){if(!await this.administrator(userId))return denied();return success(await this.divisionViews());}
  async saveDivision(userId:string,input:DivisionFormInput,id?:string){const actor=await this.administrator(userId);if(!actor)return denied();if(!input.name.trim())return invalid('name','Enter a division name.','Employees see this name throughout.');if(!input.code.trim())return invalid('code','Enter a division code.','Use a short unique code.');const [duplicates]=await this.pool.execute<RowDataPacket[]>('SELECT id FROM divisions WHERE (LOWER(name)=LOWER(?) OR LOWER(division_key)=LOWER(?)) AND id<>COALESCE(?,\'\') LIMIT 1',[input.name,input.code,id??null]);if(duplicates[0])return conflict('That division name or code is already in use.','Choose a unique name and code.');const resourceId=id??randomUUID();if(id){const [result]=await this.pool.execute<import('mysql2/promise').ResultSetHeader>('UPDATE divisions SET name=?,division_key=?,description=?,team_lead_employee_id=?,is_government=?,version=version+1 WHERE id=?',[input.name.trim(),input.code.trim().toUpperCase(),input.description.trim()||null,input.teamLeadEmployeeId||null,input.isRestricted,id]);if(!result.affectedRows)return absent();}else await this.pool.execute('INSERT INTO divisions(id,name,division_key,description,team_lead_employee_id,is_government) VALUES(?,?,?,?,?,?)',[resourceId,input.name.trim(),input.code.trim().toUpperCase(),input.description.trim()||null,input.teamLeadEmployeeId||null,input.isRestricted]);await this.audit.append({actorUserId:actor.userId,action:id?'division.updated':'division.created',resourceType:'division',resourceId,scope:{},correlationId:randomUUID(),before:null,after:{name:input.name,code:input.code}});return this.listDivisions(userId);}
  async setDivisionActive(userId:string,id:string,isActive:boolean){const actor=await this.administrator(userId);if(!actor)return denied();const current=(await this.divisionViews()).find(item=>item.id===id);if(!current)return absent();if(!isActive&&current.deactivationBlockers.length)return conflict(`${current.name} still has active references.`,current.deactivationBlockers.join(' '));await this.pool.execute('UPDATE divisions SET is_active=?,version=version+1 WHERE id=?',[isActive,id]);await this.audit.append({actorUserId:actor.userId,action:isActive?'division.activated':'division.deactivated',resourceType:'division',resourceId:id,scope:{},correlationId:randomUUID(),before:{isActive:current.isActive},after:{isActive}});return this.listDivisions(userId);}

  async listUsers(userId: string): Promise<Result<readonly UserAdminView[]>> {
    if (!await this.administrator(userId)) return denied();
    const [users] = await this.pool.execute<UserRow[]>(`SELECT u.id user_id,e.id employee_id,e.employee_code,e.display_name,e.job_title,u.image_url,u.email,u.status,
      u.two_factor_enabled,u.last_login_at,r.role_key
      FROM users u JOIN employees e ON e.user_id=u.id
      LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.effective_from<=CURRENT_DATE AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE)
      LEFT JOIN roles r ON r.id=ur.role_id
      ORDER BY e.display_name,r.role_key`);
    const [divisions] = await this.pool.execute<DivisionRow[]>(`SELECT e.user_id,d.id,d.name,d.division_key code,d.is_government restricted
      FROM employees e JOIN employee_division_assignments a ON a.employee_id=e.id AND a.is_active=TRUE
      AND a.effective_from<=CURRENT_DATE AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE)
      JOIN divisions d ON d.id=a.division_id ORDER BY d.name`);
    const [grants] = await this.pool.execute<(RowDataPacket & {user_id:string;permission_key:string})[]>(`SELECT g.user_id,p.permission_key
      FROM scoped_grants g JOIN permissions p ON p.id=g.permission_id
      WHERE g.division_id IS NULL AND g.project_id IS NULL AND g.effective_from<=CURRENT_DATE
      AND (g.effective_to IS NULL OR g.effective_to>=CURRENT_DATE)`);
    const grouped = new Map<string, UserRow[]>();
    for (const row of users) grouped.set(row.user_id, [...(grouped.get(row.user_id) ?? []), row]);
    return success([...grouped.values()].map(rows => {
      const first = rows[0];
      const roles = [...new Set(rows.map(row => row.role_key).filter((role): role is RoleKey => role !== null && role !== 'finance_manager'))];
      const primaryRole = (['super_admin','hr_manager','team_lead','management','employee'] as RoleKey[]).find(role => roles.includes(role)) ?? 'employee';
      const divisionRefs = divisions.filter(d => d.user_id === first.user_id).map(d => ({ id:d.id,name:d.name,code:d.code,isRestricted:Boolean(d.restricted) }));
      return {
        userId:first.user_id, employee:{id:first.employee_id,employeeCode:first.employee_code,fullName:first.display_name,designation:first.job_title,avatarUrl:first.image_url}, email:first.email,
        roles, roleLabels:roles.map(role => ROLE_LABEL[role]), primaryRole, status:first.status,
        statusLabel:first.status === 'active' ? 'Active' : first.status === 'locked' ? 'Locked' : 'Inactive',
        twoFactorEnabled:Boolean(first.two_factor_enabled), lastLoginLabel:first.last_login_at ? formatTimestamp(first.last_login_at.toISOString()) : null,
        scopeSummary:ROLE_SCOPE[primaryRole], divisions:divisionRefs,
        sensitivePermissions:grants.filter(g => g.user_id === first.user_id).map(g => g.permission_key),
      };
    }));
  }

  async updateEmployeeAccessRole(userId: string, targetUserId: string, role: EmployeeAccessRole) {
    const actor = await this.administrator(userId); if (!actor) return denied();
    if (!assignable.has(role)) return invalid('role','Choose an assignable employee role.','Choose Employee, Team Lead or HR Manager.');
    const changed=await this.transaction(async connection => {
      const [targets] = await connection.execute<(RowDataPacket & {status:string;role_key:StoredRoleKey|null})[]>(`SELECT u.status,r.role_key FROM users u
        LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.effective_from<=CURRENT_DATE AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE)
        LEFT JOIN roles r ON r.id=ur.role_id WHERE u.id=? FOR UPDATE`,[targetUserId]);
      if (!targets.length) return absent();
      if (targets[0].status !== 'active') return conflict('Only an active account can have its role changed.','Restore or unlock the account first.');
      const current = targets.map(t=>t.role_key).filter(Boolean) as StoredRoleKey[];
      if (current.some(value => value === 'super_admin' || value === 'management' || value === 'finance_manager')) return conflict('This account holds a protected or historical role.','Use the dedicated governance process for this role.');
      await connection.execute(`UPDATE user_roles ur JOIN roles r ON r.id=ur.role_id SET ur.effective_to=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY),ur.version=ur.version+1
        WHERE ur.user_id=? AND r.role_key IN (?,?,?) AND ur.effective_to IS NULL`,[targetUserId,...managedRoles]);
      const roles: EmployeeAccessRole[] = role === 'team_lead' ? ['employee','team_lead'] : [role];
      for (const next of roles) await connection.execute(`INSERT INTO user_roles(id,user_id,role_id,effective_from)
        SELECT ?,?,id,CURRENT_DATE FROM roles WHERE role_key=? AND is_active=TRUE`,[randomUUID(),targetUserId,next]);
      return success({current,roles});
    });
    if(changed.status!=='success')return changed;
    await this.audit.append({actorUserId:actor.userId,action:'user.role_changed',resourceType:'user',resourceId:targetUserId,scope:{},correlationId:randomUUID(),before:{roles:changed.data.current},after:{roles:changed.data.roles}});
    return this.listUsers(userId);
  }

  async deactivateUser(userId: string, targetUserId: string, reason: string) {
    const actor=await this.administrator(userId); if(!actor)return denied();
    if(targetUserId===userId)return conflict('You cannot remove your own account access.','Ask another Super Administrator to manage this account.');
    if(reason.trim().length<5)return invalid('reason','Enter a reason for removing this user\'s access.','Use at least 5 characters for the audit record.');
    const changed=await this.transaction(async connection=>{
      const [rows]=await connection.execute<(RowDataPacket&{status:string;employee_id:string})[]>('SELECT u.status,e.id employee_id FROM users u JOIN employees e ON e.user_id=u.id WHERE u.id=? FOR UPDATE',[targetUserId]);
      if(!rows[0])return absent(); if(rows[0].status==='inactive')return conflict('This account is already inactive.','No further removal action is required.');
      await connection.execute("UPDATE users SET status='inactive',version=version+1 WHERE id=?",[targetUserId]);
      await connection.execute("UPDATE employees SET status='inactive',version=version+1 WHERE user_id=?",[targetUserId]);
      await connection.execute('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(6)) WHERE user_id=?',[targetUserId]);
      return success({previousStatus:rows[0].status});
    });
    if(changed.status!=='success')return changed;
    await this.audit.append({actorUserId:actor.userId,action:'user.deactivated',resourceType:'user',resourceId:targetUserId,scope:{},reason:reason.trim(),correlationId:randomUUID(),before:{status:changed.data.previousStatus},after:{status:'inactive'}});
    return this.listUsers(userId);
  }

  async listRoles(userId: string): Promise<Result<readonly RoleAdminView[]>> {
    if(!await this.administrator(userId))return denied();
    const [roles]=await this.pool.execute<RoleRow[]>(`SELECT r.id,r.role_key,r.name,r.is_active,COUNT(DISTINCT ur.user_id) user_count FROM roles r
      LEFT JOIN user_roles ur ON ur.role_id=r.id AND ur.effective_from<=CURRENT_DATE AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE)
      GROUP BY r.id,r.role_key,r.name,r.is_active ORDER BY r.name`);
    const [permissions]=await this.pool.execute<PermissionRow[]>(`SELECT r.role_key,p.permission_key,p.name,p.sensitivity,
      EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id) granted FROM roles r CROSS JOIN permissions p ORDER BY p.name`);
    return success(roles.map(role=>({key:role.role_key,label:ROLE_LABEL[role.role_key]??role.name,description:ROLE_DESCRIPTION[role.role_key],userCount:Number(role.user_count),scopeSummary:ROLE_SCOPE[role.role_key],isRetired:role.role_key==='finance_manager'||!Boolean(role.is_active),permissions:permissions.filter(p=>p.role_key===role.role_key).map(p=>({key:p.permission_key,label:p.name,description:p.name,consequence:`Allows ${p.permission_key}.`,isSensitive:p.sensitivity!=='normal',granted:Boolean(p.granted)}))})));
  }

  async setRolePermission(userId:string,role:RoleKey,permission:PermissionKey,granted:boolean){
    const actor=await this.administrator(userId);if(!actor)return denied();
    if(role==='super_admin'&&!granted)return conflict('A Super Administrator permission cannot be removed here.','Change account governance instead.');
    const [rows]=await this.pool.execute<(RowDataPacket&{role_id:string;permission_id:string})[]>(`SELECT r.id role_id,p.id permission_id FROM roles r JOIN permissions p ON p.permission_key=? WHERE r.role_key=? AND r.is_active=TRUE`,[permission,role]);
    if(!rows[0])return absent();
    if(granted)await this.pool.execute('INSERT IGNORE INTO role_permissions(role_id,permission_id) VALUES(?,?)',[rows[0].role_id,rows[0].permission_id]);
    else await this.pool.execute('DELETE FROM role_permissions WHERE role_id=? AND permission_id=?',[rows[0].role_id,rows[0].permission_id]);
    await this.audit.append({actorUserId:actor.userId,action:granted?'role.permission_granted':'role.permission_revoked',resourceType:'role',resourceId:rows[0].role_id,scope:{role},correlationId:randomUUID(),before:{permission,granted:!granted},after:{permission,granted}});
    return this.listRoles(userId);
  }

  async getWorkPolicySettings(userId:string):Promise<Result<WorkPolicySettingsView>>{if(!await this.administrator(userId))return denied();const [rows]=await this.pool.execute<(RowDataPacket&Record<string,unknown>)[]>(`SELECT policy_key,version_number,effective_from,timezone,required_active_minutes,recognized_break_minutes,scheduled_minutes,overtime_limit_minutes,configuration FROM policy_versions WHERE effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE) ORDER BY version_number DESC LIMIT 1`);const row=rows[0];if(!row)return absent();const configuration=typeof row.configuration==='string'?JSON.parse(row.configuration):row.configuration as Record<string,unknown>;return success({policyName:String(row.policy_key).replaceAll('-',' '),version:Number(row.version_number),effectiveFromLabel:formatDate(row.effective_from instanceof Date?row.effective_from.toISOString().slice(0,10):String(row.effective_from)),requiredActiveMinutes:Number(row.required_active_minutes),recognizedBreakMinutes:Number(row.recognized_break_minutes),requiredTotalMinutes:Number(row.scheduled_minutes),overtimeThresholdMinutes:Number(row.scheduled_minutes),criticalThresholdMinutes:Number(row.overtime_limit_minutes),workingWeekdays:Array.isArray(configuration?.workingWeekdays)?configuration.workingWeekdays as number[]:[0,1,2,3,4],businessTimezone:String(row.timezone),versioningNote:'Changing a policy creates a new effective-dated version; verified history keeps its original version.',isEditable:false,readOnlyReason:'Policy mutation is restricted to the versioned policy administration workflow.'});}
  private notificationDefinitions(){return[{key:'critical_time',label:'Critical-time escalation',description:'Notifies the Team Lead and HR when a day exceeds 12 hours.',isMandatory:true},{key:'request_decision',label:'Request decisions',description:'Notifies employees when WFH or leave is decided.',isMandatory:false},{key:'period_verification',label:'Period verification',description:'Notifies stakeholders when HR verifies a period.',isMandatory:true},{key:'task_review',label:'Task review',description:'Notifies the reviewer and task creator about review actions.',isMandatory:false}] as const;}
  async listNotificationSettings(userId:string):Promise<Result<readonly NotificationSettingView[]>>{if(!await this.administrator(userId))return denied();const [rows]=await this.pool.execute<(RowDataPacket&{setting_key:string;in_app_enabled:number;email_enabled:number})[]>('SELECT setting_key,in_app_enabled,email_enabled FROM notification_preferences WHERE user_id=?',[userId]);return success(this.notificationDefinitions().map(definition=>{const row=rows.find(item=>item.setting_key===definition.key);return{...definition,inApp:row?Boolean(row.in_app_enabled):true,email:row?Boolean(row.email_enabled):false};}));}
  async setNotificationSetting(userId:string,key:string,channel:'inApp'|'email',enabled:boolean){if(!await this.administrator(userId))return denied();const definition=this.notificationDefinitions().find(item=>item.key===key);if(!definition)return absent();if(definition.isMandatory&&!enabled)return conflict(`${definition.label} cannot be switched off.`,'This notification is required by the work policy.');const column=channel==='inApp'?'in_app_enabled':'email_enabled';await this.pool.execute(`INSERT INTO notification_preferences(user_id,setting_key,${column}) VALUES(?,?,?) ON DUPLICATE KEY UPDATE ${column}=VALUES(${column}),version=version+1`,[userId,key,enabled]);return this.listNotificationSettings(userId);}
  async getAuditLog(userId:string,filters?:Partial<AuditFilters>):Promise<Result<AuditLogView>>{const actor=await this.administrator(userId);if(!actor||!actor.permissions.has('audit.view'))return denied();const values:(string|Date)[]=[];let where='1=1';if(filters?.actors?.length){where+=` AND a.actor_user_id IN (${filters.actors.map(()=>'?').join(',')})`;values.push(...filters.actors);}if(filters?.actions?.length){where+=` AND a.action IN (${filters.actions.map(()=>'?').join(',')})`;values.push(...filters.actions);}if(filters?.resourceTypes?.length){where+=` AND a.resource_type IN (${filters.resourceTypes.map(()=>'?').join(',')})`;values.push(...filters.resourceTypes);}if(filters?.from){where+=' AND a.occurred_at>=?';values.push(new Date(`${filters.from}T00:00:00Z`));}if(filters?.to){where+=' AND a.occurred_at<?';values.push(new Date(`${filters.to}T23:59:59.999Z`));}const [rows]=await this.pool.execute<(RowDataPacket&Record<string,unknown>)[]>(`SELECT a.*,u.name actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_user_id WHERE ${where} ORDER BY a.occurred_at DESC LIMIT 500`,values);const events=rows.map(row=>{const instant=row.occurred_at instanceof Date?row.occurred_at.toISOString():String(row.occurred_at);const map=(value:unknown)=>{if(value==null)return null;const data=(typeof value==='string'?JSON.parse(value):value) as Record<string,unknown>;return{visible:true as const,value:Object.fromEntries(Object.entries(data).map(([key,item])=>[key,typeof item==='string'?item:JSON.stringify(item)]))};};return{id:String(row.event_id),occurredAt:instant,occurredAtLabel:formatTimestamp(instant),actorLabel:String(row.actor_name??'System'),action:String(row.action),actionLabel:String(row.action).replaceAll('.',' '),resourceType:String(row.resource_type),resourceLabel:`${String(row.resource_type)} ${String(row.resource_id??'')}`.trim(),scopeLabel:null,reason:row.reason?String(row.reason):null,correlationId:String(row.correlation_id),before:map(row.before_protected),after:map(row.after_protected)};});const actors=[...new Map(rows.map(row=>[String(row.actor_user_id??''),String(row.actor_name??'System')])).entries()].map(([value,label])=>({value,label}));const actions=[...new Set(rows.map(row=>String(row.action)))].map(value=>({value,label:value.replaceAll('.',' ')}));const resources=[...new Set(rows.map(row=>String(row.resource_type)))].map(value=>({value,label:value.replaceAll('_',' ')}));return success({events,totalCount:events.length,actorOptions:actors,actionOptions:actions,resourceOptions:resources,restrictedCount:0});}
  async listIntegrations(userId:string):Promise<Result<readonly IntegrationPlaceholderView[]>>{if(!await this.administrator(userId))return denied();const items:readonly IntegrationPlaceholderView[]=[{key:'calendar',label:'Calendar',description:'Calendar synchronization.',plannedBehaviour:'Would import approved calendar events as reviewable drafts.',deliveryPhaseLabel:'Backend Phase 7',state:'not_configured',stateLabel:'Not configured',backendTaskIds:'BE-0740'},{key:'email',label:'Email',description:'Transactional email delivery.',plannedBehaviour:'Would deliver safe notification content by email.',deliveryPhaseLabel:'Backend Phase 7',state:'not_configured',stateLabel:'Not configured',backendTaskIds:'BE-0741'},{key:'storage',label:'Private storage',description:'Protected document and export storage.',plannedBehaviour:'Would issue short-lived authorized downloads.',deliveryPhaseLabel:'Backend Phase 7',state:'not_configured',stateLabel:'Not configured',backendTaskIds:'BE-0742'},{key:'webhooks',label:'Webhooks',description:'Signed outbound events.',plannedBehaviour:'Would send signed events for configured workflows.',deliveryPhaseLabel:'Backend Phase 7',state:'not_configured',stateLabel:'Not configured',backendTaskIds:'BE-0749'}];return success(items);}

  private async transaction<T>(work:(connection:PoolConnection)=>Promise<T>):Promise<T>{
    const connection=await this.pool.getConnection();
    try{await connection.beginTransaction();const result=await work(connection);await connection.commit();return result;}
    catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }
}
