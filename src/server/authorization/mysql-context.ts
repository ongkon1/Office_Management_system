import type { Pool, RowDataPacket } from 'mysql2/promise';
import { localParts } from '@/lib/calculation/instants';
import type { RoleKey } from '@/contracts/domain';
import type { ActorPolicyContext } from './policy';

interface IdentityRow extends RowDataPacket { user_id:string; employee_id:string|null; role_key:RoleKey|null; permission_key:string|null }
interface ScopeRow extends RowDataPacket { division_id:string|null; employee_id:string|null; project_id:string|null; team_id:string|null }

/** Loads only grants and assignments effective on the requested local business date. */
export async function loadActorPolicyContext(pool: Pool, userId: string, localDate: string): Promise<ActorPolicyContext | null> {
  const authorizationDate=localParts(new Date().toISOString(),'Asia/Dhaka').date;
  const [identity] = await pool.execute<IdentityRow[]>(`SELECT u.id user_id,e.id employee_id,r.role_key,p.permission_key
    FROM users u LEFT JOIN employees e ON e.user_id=u.id AND e.status='active'
    LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.effective_from<=? AND (ur.effective_to IS NULL OR ur.effective_to>=?)
    LEFT JOIN roles r ON r.id=ur.role_id AND r.is_active=TRUE
    LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id
    WHERE u.id=? AND u.status='active'`,[authorizationDate,authorizationDate,userId]);
  if (!identity[0]) return null;
  const employeeId=identity[0].employee_id;
  const [scopes] = await pool.execute<ScopeRow[]>(`SELECT a.division_id,a.employee_id,a.project_id,a.team_id FROM (
    SELECT eda.division_id,CASE WHEN eda.lead_employee_id=? THEN eda.employee_id ELSE NULL END employee_id,NULL project_id,eda.team_id
      FROM employee_division_assignments eda WHERE eda.is_active=TRUE AND eda.effective_from<=? AND (eda.effective_to IS NULL OR eda.effective_to>=?)
      AND (eda.employee_id=? OR eda.lead_employee_id=?)
    UNION ALL
    SELECT sg.division_id,NULL,sg.project_id,NULL FROM scoped_grants sg WHERE sg.user_id=? AND sg.effective_from<=? AND (sg.effective_to IS NULL OR sg.effective_to>=?)
  ) a`,[employeeId,localDate,localDate,employeeId,employeeId,userId,localDate,localDate]);
  const collect=<K extends keyof ScopeRow>(key:K)=>new Set(scopes.map((row)=>row[key]).filter((value):value is string=>typeof value==='string'));
  const employeeIds=collect('employee_id');
  if(employeeId) employeeIds.add(employeeId);
  // Only unscoped grants are global capabilities. A division/project grant
  // must not accidentally grant that permission over every record.
  const [personalGrants]=await pool.execute<(RowDataPacket & {permission_key:string})[]>(`SELECT p.permission_key FROM scoped_grants g JOIN permissions p ON p.id=g.permission_id WHERE g.user_id=? AND g.division_id IS NULL AND g.project_id IS NULL AND g.effective_from<=? AND (g.effective_to IS NULL OR g.effective_to>=?)`,[userId,authorizationDate,authorizationDate]);
  return {userId,employeeId,roles:[...new Set(identity.map(row=>row.role_key).filter((v):v is RoleKey=>v!==null))],permissions:new Set([...identity.map(row=>row.permission_key).filter((v):v is string=>v!==null),...personalGrants.map(row=>row.permission_key)]),divisionIds:collect('division_id'),employeeIds,projectIds:collect('project_id'),teamIds:collect('team_id')};
}
