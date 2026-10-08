import type { ReportFilterDefinition,ReportFilterOption } from '@/contracts/reporting';
import { hasPermission } from '@/server/authorization/policy';
import { describeDayStatus,WORK_LOCATION_LABEL } from '@/lib/status';
import type { ReportApplication } from './application';
/** Option labels are projected only after the same employee/division visibility checks as report rows. */
export async function reportFilters(app:ReportApplication):Promise<readonly ReportFilterDefinition[]> {
 const actor=await app.actor();if(!actor)return [];
 const repo=app.requests.repository,on=app.today(),employees:ReportFilterOption[]=[],leads=new Set<string>(),departmentIds=new Set<string>();
 /* `OH-BE-0306`, `OH-BE-0307`: an option exists only where a visible employee
    is placed, so the option list itself cannot disclose a department or a lead
    the viewer may not see. */
 for(const row of await repo.rows("SELECT id,display_name FROM employees WHERE status='active' ORDER BY display_name,id"))if(await app.employeeVisible(repo,actor,String(row.id),on)){
  employees.push({value:String(row.id),label:String(row.display_name)});
  for(const a of await repo.assignments(String(row.id),on))if(!a.is_government||hasPermission(actor,'organization.government.view')){
   if(a.effective_lead_employee_id)leads.add(String(a.effective_lead_employee_id));
   if(a.department_id)departmentIds.add(String(a.department_id));
  }
 }
 const divisions=(await repo.rows('SELECT id,name,is_government FROM divisions WHERE is_active=TRUE ORDER BY name,id')).filter(d=>(!d.is_government||hasPermission(actor,'organization.government.view'))&&(actor.roles.includes('hr_manager')||actor.roles.includes('super_admin')||actor.divisionIds.has(String(d.id))));
 const divisionIds=new Set(divisions.map(d=>String(d.id)));
 const projects=(await repo.rows('SELECT id,name,division_id FROM projects WHERE is_active=TRUE ORDER BY name,id')).filter(p=>divisionIds.has(String(p.division_id)));
 const projectIds=new Set(projects.map(p=>String(p.id)));
 const tasks=(await repo.rows('SELECT id,title,project_id FROM tasks WHERE is_active=TRUE ORDER BY title,id')).filter(t=>projectIds.has(String(t.project_id)));
 const teamLeads:ReportFilterOption[]=[];for(const id of leads){const e=await repo.employee(id);if(e)teamLeads.push({value:id,label:String(e.display_name)});}
 /* `OH-BE-0307`: a visible employee may be placed in departments the viewer has
    no authority over — a multi-division employee always is. Offering those as a
    filter would name a department the viewer cannot administer or lead, so the
    candidates are narrowed to the viewer's own scope. HR and a Super
    Administrator keep every placed department. */
 const wide=actor.roles.includes('hr_manager')||actor.roles.includes('super_admin');
 for(const id of [...departmentIds])if(!wide&&!(actor.departmentIds?.has(id)??false))departmentIds.delete(id);
 const departments:ReportFilterOption[]=[];
 if(departmentIds.size>0){
  const placeholders=[...departmentIds].map(()=>'?').join(',');
  for(const row of await repo.rows(`SELECT d.id,d.name,v.name AS division_name FROM departments d JOIN divisions v ON v.id=d.division_id WHERE d.id IN (${placeholders}) ORDER BY v.name,d.name`,[...departmentIds]))
   departments.push({value:String(row.id),label:`${String(row.division_name)} · ${String(row.name)}`});
 }
 return [
  {kind:'date_range',label:'Date range',options:[],multiple:false},
  {kind:'employee',label:'Employee',options:employees,multiple:true},
  {kind:'division',label:'Division',options:divisions.map(d=>({value:String(d.id),label:String(d.name)})),multiple:true},
  {kind:'department',label:'Department',options:departments,multiple:true},
  {kind:'project',label:'Project',options:projects.map(p=>({value:String(p.id),label:String(p.name)})),multiple:true},
  {kind:'task',label:'Task',options:tasks.map(t=>({value:String(t.id),label:String(t.title)})),multiple:true},
  {kind:'team_lead',label:'Team Lead',options:teamLeads,multiple:true},
  {kind:'employment_type',label:'Employment type',options:[{value:'full_time',label:'Full time'},{value:'part_time',label:'Part time'},{value:'contract',label:'Contract'},{value:'intern',label:'Intern'},{value:'consultant',label:'Consultant'}],multiple:true},
  {kind:'work_location',label:'Work location',options:Object.entries(WORK_LOCATION_LABEL).map(([value,label])=>({value,label})),multiple:true},
  {kind:'overtime',label:'Overtime only',options:[],multiple:false},
  {kind:'status',label:'Day status',options:(['missing','under_time','complete','overtime','critical'] as const).map(value=>({value,label:describeDayStatus(value).label})),multiple:true},
 ];
}
