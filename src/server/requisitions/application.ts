import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ApprovalReview, ReviewerRole } from '@/contracts/approval';
import type {
  Requisition,
  RequisitionDetailView,
  RequisitionFormInput,
  RequisitionListView,
  RequisitionRowView,
  RequisitionService,
} from '@/contracts/requisition';
import { REQUISITION_KIND_LABEL } from '@/contracts/requisition';
import type { FieldError, Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatDate, formatMoney, formatTimestamp, parseIsoDate } from '@/lib/format';
import { approvalDecisionAudit, canDecideApproval, canViewApproval, initialApprovalStage, pendingApprovalRoles, transitionApproval } from '@/lib/approval-chain';
import { money, storedMoney } from '@/lib/money';
import { localParts } from '@/lib/calculation/instants';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { primaryLeadOfEmployee } from '@/server/organization/department-authority';
import { recordAudit } from '@/server/audit/record';
import { NotificationService } from '@/server/notifications/service';
import { conflict, denied, invalid, notFound, unavailable } from '@/server/supporting/results';

type Db = Pool | PoolConnection;
interface ReqRow extends RowDataPacket {
  id:string; reference:string; submitter_user_id:string; submitter_employee_id:string;
  submitter_role:'employee'|'team_lead'; kind:'in_house'|'new'; assigned_team_lead_employee_id:string|null;
  item_name:string; purpose:string; urgency:string; approximate_amount:string; currency:string;
  stage:Requisition['stage']; outcome:Requisition['outcome']; submitted_at_utc:Date|string;
  submitted_local_date:Date|string; timezone:string; decided_at_utc:Date|string|null;
  model_name:string; last_recover_date:Date|string|null; submitter_name:string;
}
interface ReviewRow extends RowDataPacket {
  id:string; requisition_id:string; reviewer_user_id:string; reviewer_employee_id:string;
  reviewer_role:ReviewerRole; outcome:'approved'|'rejected'; reason:string|null; decided_at_utc:Date|string;
  reviewer_name:string;
}

const iso=(value:Date|string)=>value instanceof Date?value.toISOString():new Date(value).toISOString();
const date=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const isLead=(actor:ActorPolicyContext)=>actor.roles.includes('team_lead')||(actor.departmentLeadScopes?.length??0)>0;
const reviewRole=(actor:ActorPolicyContext):ReviewerRole|null=>actor.roles.includes('super_admin')?'super_admin':actor.roles.includes('hr_manager')?'hr_manager':isLead(actor)?'team_lead':null;

function validation(errors:readonly FieldError[]):Result<never>{
  return {status:'validation_failure',code:'VALIDATION_FAILED',message:errors.length===1?errors[0].message:`${errors.length} fields need attention.`,focusField:errors[0]?.field,fieldErrors:errors};
}

function validate(input:RequisitionFormInput,today:string):readonly FieldError[]{
  const errors:FieldError[]=[];
  const required=(field:keyof RequisitionFormInput,label:string,guidance:string)=>{if(!String(input[field]??'').trim())errors.push({field,code:'REQUIRED',message:`${label} is required.`,guidance});};
  if(input.kind!=='in_house'&&input.kind!=='new')errors.push({field:'kind',code:'INVALID_VALUE',message:'Choose a requisition type.',guidance:'Choose In-house or New.'});
  required('itemName','Name','Enter the item name.'); required('purpose','Purpose','Explain why the item is needed.');
  required('urgency','Urgency','Enter High, Medium or Low.'); required('modelName','Model','Enter a model or Unknown.');
  const raw=input.approxAmount.trim().replace(/,/g,'');
  try{if(!raw)throw new Error(); const value=money(raw,'BDT'); if(value.amount.startsWith('-'))throw new Error();}
  catch{errors.push({field:'approxAmount',code:'INVALID_AMOUNT',message:'Enter a valid non-negative amount.',guidance:'Use BDT with at most two decimal places, for example 4500.50.'});}
  if(input.kind==='in_house'){
    const value=input.lastRecoverDate.trim();
    if(!value)errors.push({field:'lastRecoverDate',code:'REQUIRED',message:'Last recover date is required.',guidance:'Use YYYY-MM-DD.'});
    else if(!parseIsoDate(value)||value>today)errors.push({field:'lastRecoverDate',code:'INVALID_DATE',message:'Last recover date is invalid.',guidance:'Use a real date on or before today in YYYY-MM-DD format.'});
  }
  return errors;
}

export class MysqlRequisitionService implements RequisitionService{
  constructor(private readonly pool:Pool,private readonly actor:ActorPolicyContext,private readonly now=()=>new Date().toISOString()){}

  private today(){return localParts(this.now(),'Asia/Dhaka').date;}
  private sameActor(userId:string){return userId===this.actor.userId;}
  private async reviews(db:Db,id:string){
    const [rows]=await db.execute<ReviewRow[]>(`SELECT rr.*,e.display_name reviewer_name FROM requisition_reviews rr JOIN employees e ON e.id=rr.reviewer_employee_id WHERE rr.requisition_id=? ORDER BY rr.decided_at_utc,rr.id`,[id]);
    return rows;
  }
  private async row(db:Db,id:string,lock=false){
    const [rows]=await db.execute<ReqRow[]>(`SELECT r.*,e.display_name submitter_name,COALESCE(ih.model_name,nw.model_name) model_name,ih.last_recover_date
      FROM requisitions r JOIN employees e ON e.id=r.submitter_employee_id
      LEFT JOIN requisition_in_house_details ih ON ih.requisition_id=r.id
      LEFT JOIN requisition_new_details nw ON nw.requisition_id=r.id WHERE r.id=?${lock?' FOR UPDATE':''}`,[id]);
    return rows[0]??null;
  }
  /** Re-resolve open employee requests so a lead change cannot orphan work. */
  async refreshAssignments(){
    const connection=await this.pool.getConnection();
    try{await connection.beginTransaction();const [rows]=await connection.execute<ReqRow[]>("SELECT * FROM requisitions WHERE stage='team_lead_review' FOR UPDATE");for(const row of rows){const current=await primaryLeadOfEmployee(connection,row.submitter_employee_id,this.today());if(current===row.assigned_team_lead_employee_id)continue;if(current){await connection.execute('UPDATE requisitions SET assigned_team_lead_employee_id=?,version=version+1 WHERE id=?',[current,row.id]);await recordAudit(connection,{actorUserId:null,action:'requisition.team_lead.reassigned',resourceType:'requisition',resourceId:row.id,before:{teamLeadEmployeeId:row.assigned_team_lead_employee_id},after:{teamLeadEmployeeId:current}});await new NotificationService(connection,this.now).notifyEmployees([current],{type:'requisition_review_requested',related:{type:'requisition',id:row.id},occurrenceKey:`rerouted:${row.id}:${current}`});}else{await connection.execute("UPDATE requisitions SET stage='reviewer_review',assigned_team_lead_employee_id=NULL,version=version+1 WHERE id=?",[row.id]);await recordAudit(connection,{actorUserId:null,action:'requisition.team_lead.unavailable_escalation',resourceType:'requisition',resourceId:row.id,reason:'No effective primary Team Lead remained.',before:{stage:'team_lead_review',teamLeadEmployeeId:row.assigned_team_lead_employee_id},after:{stage:'reviewer_review',teamLeadEmployeeId:null}});await this.notifyNext(connection,row.id,await this.parallelReviewerUsers(connection),`lead-unavailable:${row.id}`);}}await connection.commit();}catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }
  private canView(row:ReqRow){
    return canViewApproval(this.domain(row,[]),{userId:this.actor.userId,employeeId:this.actor.employeeId,reviewerRole:reviewRole(this.actor)});
  }
  private canDecide(row:ReqRow,reviews:readonly ReviewRow[]){
    return canDecideApproval(this.domain(row,reviews),{userId:this.actor.userId,employeeId:this.actor.employeeId,reviewerRole:reviewRole(this.actor)});
  }
  private domain(row:ReqRow,reviews:readonly ReviewRow[]):Requisition{
    return {id:row.id,reference:row.reference,kind:row.kind,submitterUserId:row.submitter_user_id,submitterEmployeeId:row.submitter_employee_id,
      submitterRole:row.submitter_role,teamLeadEmployeeId:row.assigned_team_lead_employee_id,itemName:row.item_name,purpose:row.purpose,urgency:row.urgency,
      approxAmount:storedMoney(String(row.approximate_amount),row.currency),modelName:row.model_name,lastRecoverDate:row.last_recover_date?date(row.last_recover_date):null,
      stage:row.stage,outcome:row.outcome,submittedAt:iso(row.submitted_at_utc),decidedAt:row.decided_at_utc?iso(row.decided_at_utc):null,
      reviews:reviews.map((review):ApprovalReview=>({id:review.id,reviewerUserId:review.reviewer_user_id,reviewerEmployeeId:review.reviewer_employee_id,reviewerRole:review.reviewer_role,decision:review.outcome,reason:review.reason,decidedAt:iso(review.decided_at_utc)}))};
  }
  private stageLabel(record:Requisition){return record.stage==='team_lead_review'?'Waiting for Team Lead':record.stage==='reviewer_review'?'Waiting for HR and Super Administrator':record.outcome==='approved'?'Approved':record.outcome==='rejected'?'Rejected':'Withdrawn';}
  private next(record:Requisition){if(record.stage==='team_lead_review')return 'The assigned Team Lead must review this requisition.';if(record.stage==='reviewer_review')return `${pendingApprovalRoles(record).map(r=>r==='hr_manager'?'HR':'Super Administrator').join(' and ')} must review this requisition.`;return record.outcome==='approved'?'All required reviewers approved this requisition.':record.outcome==='rejected'?'A reviewer rejected this requisition.':'The submitter withdrew this requisition.';}
  private timeline(record:Requisition,rows:readonly ReviewRow[]){
    const canDecide=this.canDecide(this.rowFrom(record,rows),rows);
    return {stage:record.stage,stageLabel:this.stageLabel(record),outcome:record.outcome,outcomeLabel:record.outcome?record.outcome[0].toUpperCase()+record.outcome.slice(1):null,nextStep:this.next(record),
      reviews:rows.map(r=>({id:r.id,reviewerName:r.reviewer_name,reviewerRoleLabel:r.reviewer_role==='team_lead'?'Team Lead':r.reviewer_role==='hr_manager'?'HR':r.reviewer_role==='super_admin'?'Super Administrator':'Finance (retired)',decision:r.outcome,decisionLabel:r.outcome==='approved'?'Approved':'Rejected',reason:r.reason,decidedAtLabel:formatTimestamp(iso(r.decided_at_utc),'Asia/Dhaka')})),
      pendingReviewers:pendingApprovalRoles(record).map(role=>({roleLabel:role==='hr_manager'?'HR':'Super Administrator'})),canDecide,canWithdraw:record.submitterUserId===this.actor.userId&&record.stage!=='decided'};
  }
  private rowFrom(record:Requisition,reviews:readonly ReviewRow[]):ReqRow{return {id:record.id,reference:record.reference,submitter_user_id:record.submitterUserId,submitter_employee_id:record.submitterEmployeeId,submitter_role:record.submitterRole,kind:record.kind,assigned_team_lead_employee_id:record.teamLeadEmployeeId,item_name:record.itemName,purpose:record.purpose,urgency:record.urgency,approximate_amount:record.approxAmount.amount,currency:record.approxAmount.currency,stage:record.stage,outcome:record.outcome,submitted_at_utc:record.submittedAt,submitted_local_date:record.submittedAt.slice(0,10),timezone:'Asia/Dhaka',decided_at_utc:record.decidedAt,model_name:record.modelName,last_recover_date:record.lastRecoverDate,submitter_name:'',constructor:{name:'RowDataPacket'},reviews} as unknown as ReqRow;}
  private detail(row:ReqRow,reviews:readonly ReviewRow[]):RequisitionDetailView{const r=this.domain(row,reviews);return {...this.timeline(r,reviews),id:r.id,reference:r.reference,kind:r.kind,kindLabel:REQUISITION_KIND_LABEL[r.kind],itemName:r.itemName,purpose:r.purpose,urgency:r.urgency,modelName:r.modelName,amountDisplay:formatMoney(r.approxAmount),lastRecoverDateLabel:r.lastRecoverDate?formatDate(r.lastRecoverDate):null,submitterName:row.submitter_name,submitterRoleLabel:r.submitterRole==='team_lead'?'Team Lead':'Employee',submittedAtLabel:formatTimestamp(r.submittedAt,'Asia/Dhaka')};}
  private rowView(row:ReqRow,reviews:readonly ReviewRow[]):RequisitionRowView{const r=this.domain(row,reviews);return {id:r.id,reference:r.reference,kind:r.kind,kindLabel:REQUISITION_KIND_LABEL[r.kind],itemName:r.itemName,purpose:r.purpose,urgency:r.urgency,submitterName:row.submitter_name,submittedAtLabel:formatTimestamp(r.submittedAt,'Asia/Dhaka'),amountDisplay:formatMoney(r.approxAmount),stage:r.stage,stageLabel:this.stageLabel(r),outcome:r.outcome,nextStep:this.next(r),awaitingThisViewer:this.canDecide(row,reviews),href:`/requisitions/${r.id}`};}

  async list(userId:string):Promise<Result<RequisitionListView>>{try{if(!this.sameActor(userId))return notFound('Requisition');const [rows]=await this.pool.execute<ReqRow[]>(`SELECT r.*,e.display_name submitter_name,COALESCE(ih.model_name,nw.model_name) model_name,ih.last_recover_date FROM requisitions r JOIN employees e ON e.id=r.submitter_employee_id LEFT JOIN requisition_in_house_details ih ON ih.requisition_id=r.id LEFT JOIN requisition_new_details nw ON nw.requisition_id=r.id ORDER BY r.submitted_at_utc DESC`);const visible:RequisitionRowView[]=[];for(const row of rows){if(!this.canView(row))continue;const reviews=await this.reviews(this.pool,row.id);visible.push(this.rowView(row,reviews));}const maySubmit=Boolean(this.actor.employeeId)&&(this.actor.roles.includes('employee')||isLead(this.actor));return success({rows:visible,awaitingCount:visible.filter(r=>r.awaitingThisViewer).length,canSubmit:maySubmit,submitBlockedReason:maySubmit?null:'Only an Employee or Team Lead can raise a requisition.',scopeLabel:this.actor.roles.includes('hr_manager')||this.actor.roles.includes('super_admin')?'Requisitions awaiting organizational review':'My requisitions and decisions'});}catch{return unavailable('Requisitions could not be loaded.');}}
  async get(userId:string,id:string):Promise<Result<RequisitionDetailView>>{try{if(!this.sameActor(userId))return notFound('Requisition');const row=await this.row(this.pool,id);if(!row||!this.canView(row))return notFound('Requisition');return success(this.detail(row,await this.reviews(this.pool,id)));}catch{return unavailable('The requisition could not be loaded.');}}
  async submit(userId:string,input:RequisitionFormInput):Promise<Result<RequisitionDetailView>>{if(!this.sameActor(userId)||!this.actor.employeeId)return denied();const submitterRole=isLead(this.actor)?'team_lead':this.actor.roles.includes('employee')?'employee':null;if(!submitterRole)return denied('Only an Employee or Team Lead can raise a requisition.');const errors=validate(input,this.today());if(errors.length)return validation(errors);const lead=submitterRole==='employee'?await primaryLeadOfEmployee(this.pool,this.actor.employeeId,this.today()):null;if(submitterRole==='employee'&&!lead)return conflict('No Team Lead is assigned to your primary placement.','Ask HR to assign a Team Lead, then try again.');const connection=await this.pool.getConnection();try{await connection.beginTransaction();const id=randomUUID(),instant=this.now(),reference=`RQ-${this.today().slice(0,4)}-${id.slice(0,8).toUpperCase()}`;await connection.execute(`INSERT INTO requisitions(id,reference,submitter_user_id,submitter_employee_id,submitter_role,kind,assigned_team_lead_employee_id,item_name,purpose,urgency,approximate_amount,currency,stage,submitted_at_utc,submitted_local_date,timezone,created_by_user_id,updated_by_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,reference,userId,this.actor.employeeId,submitterRole,input.kind,lead,input.itemName.trim(),input.purpose.trim(),input.urgency.trim(),money(input.approxAmount.trim().replace(/,/g,''),'BDT').amount,'BDT',initialApprovalStage(submitterRole),new Date(instant),this.today(),'Asia/Dhaka',userId,userId]);if(input.kind==='in_house')await connection.execute('INSERT INTO requisition_in_house_details(requisition_id,last_recover_date,model_name) VALUES(?,?,?)',[id,input.lastRecoverDate.trim(),input.modelName.trim()]);else await connection.execute('INSERT INTO requisition_new_details(requisition_id,model_name) VALUES(?,?)',[id,input.modelName.trim()]);await recordAudit(connection,{actorUserId:userId,action:'requisition.submitted',resourceType:'requisition',resourceId:id,after:{reference,kind:input.kind,stage:initialApprovalStage(submitterRole),amount:money(input.approxAmount.trim().replace(/,/g,''),'BDT')}});await this.notifyNext(connection,id,submitterRole==='employee'?[lead!]:await this.parallelReviewerUsers(connection),`submitted:${id}`);await connection.commit();const row=await this.row(this.pool,id);return row?success(this.detail(row,[])):unavailable('The requisition was saved but could not be reloaded.');}catch{await connection.rollback();return unavailable('The requisition could not be saved.');}finally{connection.release();}}
  async decide(userId:string,id:string,input:{decision:'approved'|'rejected';reason:string}):Promise<Result<RequisitionDetailView>>{
    if(!this.sameActor(userId)||!this.actor.employeeId)return notFound('Requisition');
    if(input.decision==='rejected'&&!input.reason.trim())return invalid('reason','A rejection reason is required.','Explain what the submitter should correct.');
    const connection=await this.pool.getConnection();
    try{
      await connection.beginTransaction();
      const row=await this.row(connection,id,true);
      if(!row||!this.canView(row)){await connection.rollback();return notFound('Requisition');}
      const reviews=await this.reviews(connection,id);
      if(row.stage==='decided'){await connection.rollback();return conflict('This requisition has already been decided.','Reload to see the recorded outcome.');}
      const role=reviewRole(this.actor);
      if(role&&reviews.some(item=>item.reviewer_role===role)){await connection.rollback();return conflict('A decision for this reviewer role was already recorded.','Reload to see the recorded decision.');}
      if(!role||!this.canDecide(row,reviews)){await connection.rollback();return denied('This requisition is not waiting for your decision.');}
      const review:ApprovalReview={id:randomUUID(),reviewerUserId:userId,reviewerEmployeeId:this.actor.employeeId,reviewerRole:role,decision:input.decision,reason:input.reason.trim()||null,decidedAt:this.now()};
      const record=this.domain(row,reviews),next=transitionApproval(record,review);
      await connection.execute('INSERT INTO requisition_reviews(id,requisition_id,reviewer_user_id,reviewer_employee_id,reviewer_role,stage,outcome,reason,decided_at_utc) VALUES(?,?,?,?,?,?,?,?,?)',[review.id,id,userId,this.actor.employeeId,role,row.stage,input.decision,review.reason,new Date(review.decidedAt)]);
      await connection.execute('UPDATE requisitions SET stage=?,outcome=?,decided_at_utc=?,updated_by_user_id=?,version=version+1 WHERE id=?',[next.stage,next.outcome,next.decidedAt?new Date(next.decidedAt):null,userId,id]);
      await recordAudit(connection,{actorUserId:userId,action:'requisition.decision.recorded',resourceType:'requisition',resourceId:id,reason:review.reason,...approvalDecisionAudit(record,next,review)});
      if(next.stage==='reviewer_review'&&row.stage==='team_lead_review')await this.notifyNext(connection,id,await this.parallelReviewerUsers(connection),`parallel:${id}`);
      if(next.stage==='decided')await this.notifyNext(connection,id,[row.submitter_user_id],`decided:${id}`,'requisition_decided');
      await connection.commit();
      const updated=await this.row(this.pool,id);
      return updated?success(this.detail(updated,await this.reviews(this.pool,id))):unavailable('The decision was saved but could not be reloaded.');
    }catch(error){
      await connection.rollback();
      if((error as {errno?:number}).errno===1062)return conflict('A decision for this reviewer role was already recorded.','Reload to see the recorded decision.');
      return unavailable('The decision could not be saved.');
    }finally{connection.release();}
  }
  async withdraw(userId:string,id:string):Promise<Result<RequisitionDetailView>>{if(!this.sameActor(userId))return notFound('Requisition');const connection=await this.pool.getConnection();try{await connection.beginTransaction();const row=await this.row(connection,id,true);if(!row||row.submitter_user_id!==userId){await connection.rollback();return notFound('Requisition');}if(row.stage==='decided'){await connection.rollback();return conflict('This requisition has already been decided.','A decided requisition cannot be withdrawn.');}const instant=this.now();await connection.execute("UPDATE requisitions SET stage='decided',outcome='withdrawn',decided_at_utc=?,updated_by_user_id=?,version=version+1 WHERE id=?",[new Date(instant),userId,id]);await recordAudit(connection,{actorUserId:userId,action:'requisition.withdrawn',resourceType:'requisition',resourceId:id,before:{stage:row.stage},after:{stage:'decided',outcome:'withdrawn'}});await connection.commit();const updated=await this.row(this.pool,id);return updated?success(this.detail(updated,await this.reviews(this.pool,id))):unavailable('The requisition was withdrawn but could not be reloaded.');}catch{await connection.rollback();return unavailable('The requisition could not be withdrawn.');}finally{connection.release();}}
  async queue(userId:string):Promise<Result<{awaitingCount:number;href:string}>>{const list=await this.list(userId);return list.status==='success'?success({awaitingCount:list.data.awaitingCount,href:'/requisitions'}):list;}
  private async parallelReviewerUsers(db:Db){const [rows]=await db.execute<(RowDataPacket&{user_id:string})[]>(`SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id AND u.status='active' WHERE r.role_key IN ('hr_manager','super_admin') AND ur.effective_from<=? AND (ur.effective_to IS NULL OR ur.effective_to>=?)`,[this.today(),this.today()]);return rows.map(r=>r.user_id);}
  private async notifyNext(db:Db,id:string,recipients:readonly string[],occurrence:string,type:'requisition_review_requested'|'requisition_decided'='requisition_review_requested'){await new NotificationService(db, this.now).notify({recipientUserIds:recipients,type,related:{type:'requisition',id},occurrenceKey:occurrence});}
}
