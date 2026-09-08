import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { inTransaction } from '@/server/database/transaction';
import type { AssignmentRow, DivisionRow, EmployeeRow, OrganizationWorkRepository, ProjectRow, TaskRow } from './service';

type Executor = Pick<Pool|PoolConnection,'execute'>;
type Row = RowDataPacket & Record<string, unknown>;
type SqlValue = string | number | boolean | null;
const bool=(value:unknown)=>Boolean(value);

export class MysqlOrganizationWorkRepository implements OrganizationWorkRepository {
  constructor(private readonly pool:Pool,private readonly connection?:PoolConnection){}
  private get db():Executor{return this.connection??this.pool}
  async transaction<T>(work:(repository:OrganizationWorkRepository)=>Promise<T>):Promise<T>{
    if(this.connection)return work(this);
    return inTransaction(this.pool,(connection)=>work(new MysqlOrganizationWorkRepository(this.pool,connection)));
  }
  private async one(sql:string,values:SqlValue[]):Promise<Row|null>{const [rows]=await this.db.execute<Row[]>(sql,values);return rows[0]??null}
  private async changed(sql:string,values:SqlValue[]):Promise<boolean>{const [result]=await this.db.execute<ResultSetHeader>(sql,values);return result.affectedRows>0}

  async getDivision(id:string){const r=await this.one('SELECT id,division_key,name,is_active,is_government,version FROM divisions WHERE id=?',[id]);return r?{id:String(r.id),code:String(r.division_key),name:String(r.name),isActive:bool(r.is_active),restricted:bool(r.is_government),version:Number(r.version)}:null}
  async saveDivision(r:DivisionRow,v?:number){
    if(v===undefined)return this.changed('INSERT INTO divisions(id,division_key,name,is_active,is_government,version) VALUES(?,?,?,?,?,?)',[r.id,r.code,r.name,r.isActive,r.restricted,r.version]);
    return this.changed('UPDATE divisions SET division_key=?,name=?,is_active=?,is_government=?,version=version+1 WHERE id=? AND version=?',[r.code,r.name,r.isActive,r.restricted,r.id,v]);
  }
  async getEmployee(id:string){const r=await this.one('SELECT id,user_id,employee_code,display_name,profile_photo_attachment_id,status,version FROM employees WHERE id=?',[id]);return r?{id:String(r.id),userId:String(r.user_id),code:String(r.employee_code),name:String(r.display_name),profilePhotoAttachmentId:r.profile_photo_attachment_id?String(r.profile_photo_attachment_id):null,isActive:r.status==='active',version:Number(r.version)}:null}
  async saveEmployee(r:EmployeeRow,v?:number){
    if(v===undefined)return this.changed("INSERT INTO employees(id,user_id,employee_code,display_name,profile_photo_attachment_id,status,version) VALUES(?,?,?,?,?,?,?)",[r.id,r.userId,r.code,r.name,r.profilePhotoAttachmentId,r.isActive?'active':'inactive',r.version]);
    return this.changed("UPDATE employees SET employee_code=?,display_name=?,profile_photo_attachment_id=?,status=?,version=version+1 WHERE id=? AND version=?",[r.code,r.name,r.profilePhotoAttachmentId,r.isActive?'active':'inactive',r.id,v]);
  }
  async assignments(employeeId:string){const [rows]=await this.db.execute<Row[]>('SELECT id,employee_id,division_id,lead_employee_id,effective_from,effective_to,allocation_percent_basis_points,is_primary,is_temporary,is_active,version FROM employee_division_assignments WHERE employee_id=? ORDER BY effective_from',[employeeId]);return rows.map(mapAssignment)}
  async getAssignment(id:string){const r=await this.one('SELECT id,employee_id,division_id,lead_employee_id,effective_from,effective_to,allocation_percent_basis_points,is_primary,is_temporary,is_active,version FROM employee_division_assignments WHERE id=?',[id]);return r?mapAssignment(r):null}
  async saveAssignment(r:AssignmentRow,v?:number){
    const bp=r.allocationPercent*100;
    if(v===undefined)return this.changed('INSERT INTO employee_division_assignments(id,employee_id,division_id,lead_employee_id,effective_from,effective_to,allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_temporary,is_active,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[r.id,r.employeeId,r.divisionId,r.leadEmployeeId,r.from,r.to,bp,0,r.primary,r.temporary,r.isActive,r.version]);
    return this.changed('UPDATE employee_division_assignments SET division_id=?,lead_employee_id=?,effective_from=?,effective_to=?,allocation_percent_basis_points=?,is_primary=?,is_temporary=?,is_active=?,version=version+1 WHERE id=? AND version=?',[r.divisionId,r.leadEmployeeId,r.from,r.to,bp,r.primary,r.temporary,r.isActive,r.id,v]);
  }
  async getProject(id:string){const r=await this.one('SELECT id,division_id,manager_employee_id,status,accepts_time_entries,completion_percent,is_active,version FROM projects WHERE id=?',[id]);return r?mapProject(r):null}
  async saveProject(r:ProjectRow,v?:number){
    if(v===undefined)return this.changed("INSERT INTO projects(id,division_id,project_code,name,status,manager_employee_id,priority,completion_percent,accepts_time_entries,is_active,version) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[r.id,r.divisionId,r.id,r.id,r.status,r.managerEmployeeId,'medium',r.completionPercent,r.acceptsTime,r.isActive,r.version]);
    return this.changed('UPDATE projects SET division_id=?,manager_employee_id=?,status=?,completion_percent=?,accepts_time_entries=?,is_active=?,version=version+1 WHERE id=? AND version=?',[r.divisionId,r.managerEmployeeId,r.status,r.completionPercent,r.acceptsTime,r.isActive,r.id,v]);
  }
  async projectActualMinutes(id:string){const r=await this.one('SELECT actual_minutes FROM project_actual_minutes WHERE project_id=?',[id]);return Number(r?.actual_minutes??0)}
  async getTask(id:string){const r=await this.one('SELECT t.id,t.project_id,p.division_id,t.creator_employee_id,t.assignee_employee_id,t.status,t.due_date,t.review_state,t.reviewer_employee_id,t.reviewed_at,t.review_note,t.is_active,t.version FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=?',[id]);return r?mapTask(r):null}
  async saveTask(r:TaskRow,v?:number){
    if(v===undefined)return this.changed('INSERT INTO tasks(id,project_id,title,status,creator_employee_id,assignee_employee_id,due_date,review_state,reviewer_employee_id,reviewed_at,review_note,is_active,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[r.id,r.projectId,r.id,r.status,r.creatorEmployeeId,r.assigneeEmployeeId,r.dueDate,r.reviewState,r.reviewerEmployeeId,r.reviewedAt,r.reviewNote,r.isActive,r.version]);
    return this.changed('UPDATE tasks SET project_id=?,status=?,assignee_employee_id=?,due_date=?,review_state=?,reviewer_employee_id=?,reviewed_at=?,review_note=?,is_active=?,version=version+1 WHERE id=? AND version=?',[r.projectId,r.status,r.assigneeEmployeeId,r.dueDate,r.reviewState,r.reviewerEmployeeId,r.reviewedAt,r.reviewNote,r.isActive,r.id,v]);
  }
  async taskActualMinutes(id:string){const r=await this.one('SELECT actual_minutes FROM task_actual_minutes WHERE task_id=?',[id]);return Number(r?.actual_minutes??0)}
  async effectiveLead(employeeId:string,date:string){const r=await this.one('SELECT lead_employee_id FROM employee_division_assignments WHERE employee_id=? AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) AND lead_employee_id IS NOT NULL ORDER BY is_primary DESC,effective_from DESC LIMIT 1',[employeeId,date,date]);return r?.lead_employee_id?String(r.lead_employee_id):null}
  async appendTaskDecision(i:{id:string;taskId:string;reviewerEmployeeId:string;decision:'approved'|'rejected';note:string|null;idempotencyKey:string;decidedAt:string}){
    try{await this.db.execute('INSERT INTO task_review_decisions(id,task_id,reviewer_employee_id,decision,note,idempotency_key,decided_at) VALUES(?,?,?,?,?,?,?)',[i.id,i.taskId,i.reviewerEmployeeId,i.decision,i.note,i.idempotencyKey,i.decidedAt]);return 'created' as const}catch{const same=await this.one('SELECT task_id FROM task_review_decisions WHERE reviewer_employee_id=? AND idempotency_key=?',[i.reviewerEmployeeId,i.idempotencyKey]);return same&&same.task_id===i.taskId?'replayed' as const:'conflict' as const}
  }
}

function mapAssignment(r:Row):AssignmentRow{return{id:String(r.id),employeeId:String(r.employee_id),divisionId:String(r.division_id),leadEmployeeId:r.lead_employee_id?String(r.lead_employee_id):null,from:String(r.effective_from),to:r.effective_to?String(r.effective_to):null,allocationPercent:Number(r.allocation_percent_basis_points)/100,primary:bool(r.is_primary),temporary:bool(r.is_temporary),isActive:bool(r.is_active),version:Number(r.version)}}
function mapProject(r:Row):ProjectRow{return{id:String(r.id),divisionId:String(r.division_id),managerEmployeeId:String(r.manager_employee_id),status:r.status as ProjectRow['status'],acceptsTime:bool(r.accepts_time_entries),completionPercent:Number(r.completion_percent),isActive:bool(r.is_active),version:Number(r.version)}}
function mapTask(r:Row):TaskRow{return{id:String(r.id),projectId:String(r.project_id),divisionId:String(r.division_id),creatorEmployeeId:String(r.creator_employee_id),assigneeEmployeeId:String(r.assignee_employee_id),status:r.status as TaskRow['status'],dueDate:r.due_date?String(r.due_date):null,reviewState:r.review_state as TaskRow['reviewState'],reviewerEmployeeId:r.reviewer_employee_id?String(r.reviewer_employee_id):null,reviewedAt:r.reviewed_at?String(r.reviewed_at):null,reviewNote:r.review_note?String(r.review_note):null,isActive:bool(r.is_active),version:Number(r.version)}}
