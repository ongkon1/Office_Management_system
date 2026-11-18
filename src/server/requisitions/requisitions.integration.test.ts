import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RequisitionFormInput } from '@/contracts/requisition';
import { data, EMPLOYEE, USER, phase7Database } from '@/server/test/phase7-fixture';
import { MysqlRequisitionService } from './application';

let env:Awaited<ReturnType<typeof phase7Database>>;
const NOW='2026-11-16T04:00:00.000Z';
const form=(kind:'in_house'|'new'='new'):RequisitionFormInput=>({kind,itemName:'Laptop',purpose:'Delivery work',urgency:'High',approxAmount:'125000.50',modelName:'ThinkPad',lastRecoverDate:kind==='in_house'?'2026-10-01':''});
beforeAll(async()=>{
  env=await phase7Database();
  await env.pool.execute("INSERT INTO user_roles(id,user_id,role_id,effective_from) VALUES(UUID(),?,'20000000-0000-4000-8000-000000000003','2026-01-01')",[USER(7)]);
  await env.pool.execute("INSERT INTO employee_division_assignments(id,employee_id,division_id,department_id,lead_employee_id,effective_from,allocation_percent_basis_points,expected_weekly_minutes,is_primary) VALUES(UUID(),?,'10000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001',?,'2026-01-01',10000,2100,TRUE)",[EMPLOYEE(7),EMPLOYEE(2)]);
});
afterAll(async()=>{await env?.close();});
const service=async(n:number)=>new MysqlRequisitionService(env.pool,await env.actor(n),()=>NOW);

describe('Backend Phase 10 requisitions',()=>{
  it('stores exactly one typed detail and preserves exact BDT money',async()=>{
    const employee=await service(7);const created=data(await employee.submit(USER(7),form('in_house')));
    expect(created).toMatchObject({kind:'in_house',amountDisplay:'BDT 125,000.50',stage:'team_lead_review'});
    expect(await env.rows('SELECT COUNT(*) count FROM requisition_in_house_details WHERE requisition_id=?',[created.id])).toEqual([{count:1}]);
    expect(await env.rows('SELECT COUNT(*) count FROM requisition_new_details WHERE requisition_id=?',[created.id])).toEqual([{count:0}]);
  });
  it('routes Employee to Team Lead, then requires both parallel reviewers',async()=>{
    const employee=await service(7),lead=await service(2),hr=await service(4),admin=await service(1);const created=data(await employee.submit(USER(7),form()));
    expect((await hr.get(USER(4),created.id)).status).toBe('not_found');
    expect(data(await lead.decide(USER(2),created.id,{decision:'approved',reason:''})).stage).toBe('reviewer_review');
    expect(data(await hr.decide(USER(4),created.id,{decision:'approved',reason:''})).outcome).toBeNull();
    expect(data(await admin.decide(USER(1),created.id,{decision:'approved',reason:''})).outcome).toBe('approved');
  });
  it('lets a Team Lead submit directly to HR and Super Administrator',async()=>{const lead=await service(2);expect(data(await lead.submit(USER(2),form())).stage).toBe('reviewer_review');});
  it('supports rejection, withdrawal, identical not-found, and append-only reviews',async()=>{
    const employee=await service(7),lead=await service(2),outsider=await service(6);const rejected=data(await employee.submit(USER(7),form()));
    expect((await lead.decide(USER(2),rejected.id,{decision:'rejected',reason:''})).status).toBe('validation_failure');
    expect(data(await lead.decide(USER(2),rejected.id,{decision:'rejected',reason:'Not justified'})).outcome).toBe('rejected');
    const open=data(await employee.submit(USER(7),form()));expect(data(await employee.withdraw(USER(7),open.id)).outcome).toBe('withdrawn');
    expect((await outsider.get(USER(6),open.id)).status).toBe((await outsider.get(USER(6),'missing')).status);
    const [review]=await env.rows('SELECT id FROM requisition_reviews WHERE requisition_id=?',[rejected.id]);await expect(env.pool.execute('UPDATE requisition_reviews SET reason=? WHERE id=?',['changed',review.id])).rejects.toThrow();
  });
  it('serializes concurrent decisions for one reviewer role',async()=>{
    const lead=await service(2),hr=await service(4);const created=data(await lead.submit(USER(2),form()));
    const results=await Promise.all([hr.decide(USER(4),created.id,{decision:'approved',reason:''}),hr.decide(USER(4),created.id,{decision:'approved',reason:''})]);
    expect(results.map(r=>r.status).sort()).toEqual(['conflict','success']);
    expect(await env.rows("SELECT COUNT(*) count FROM requisition_reviews WHERE requisition_id=? AND reviewer_role='hr_manager'",[created.id])).toEqual([{count:1}]);
  });
  it('does not let a client-supplied user id impersonate another account',async()=>{const employee=await service(7);expect((await employee.list(USER(1))).status).toBe('not_found');expect((await employee.submit(USER(1),form())).status).toBe('permission_denied');});
  it('reroutes an open request when the effective Team Lead changes, then escalates if no lead remains',async()=>{
    const employee=await service(7);const created=data(await employee.submit(USER(7),form()));
    await env.pool.execute("UPDATE department_lead_assignments SET effective_to='2026-10-03' WHERE id='23000000-0000-4000-8000-000000000002'");
    await env.pool.execute("INSERT INTO department_lead_assignments(id,department_id,lead_employee_id,effective_from,reason) VALUES(UUID(),'22000000-0000-4000-8000-000000000001',?,'2026-10-04','Test reassignment')",[EMPLOYEE(8)]);
    const newLead=await service(8);await newLead.refreshAssignments();expect(data(await newLead.get(USER(8),created.id)).canDecide).toBe(true);
    await env.pool.execute("UPDATE department_lead_assignments SET effective_to='2026-10-04' WHERE department_id='22000000-0000-4000-8000-000000000001' AND lead_employee_id=? AND effective_to IS NULL",[EMPLOYEE(8)]);
    await newLead.refreshAssignments();const hr=await service(4);expect(data(await hr.get(USER(4),created.id)).stage).toBe('reviewer_review');
    expect(await env.rows("SELECT COUNT(*) count FROM audit_events WHERE resource_id=? AND action IN ('requisition.team_lead.reassigned','requisition.team_lead.unavailable_escalation')",[created.id])).toEqual([{count:2}]);
  });
});
