import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { RoleKey, SessionUser } from '@/contracts/domain';
import { localParts } from '@/lib/calculation/instants';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';

interface UserRow extends RowDataPacket {
  name: string;
  email: string;
  image_url: string | null;
  employee_id: string | null;
  employee_name: string | null;
}

const ROLE_PRIORITY: readonly RoleKey[] = ['super_admin','hr_manager','management','team_lead','employee'];

export async function loadSessionUser(
  pool: Pick<Pool, 'execute'>,
  userId: string,
  expiresAt: string,
): Promise<SessionUser | null> {
  const [rows] = await pool.execute<UserRow[]>(`SELECT u.name,u.email,u.image_url,e.id employee_id,e.display_name employee_name
    FROM users u LEFT JOIN employees e ON e.user_id=u.id AND e.status='active'
    WHERE u.id=? AND u.status='active' LIMIT 1`, [userId]);
  const row=rows[0];
  if(!row) return null;
  const timezone=process.env.BUSINESS_TIMEZONE ?? 'Asia/Dhaka';
  const localDate=localParts(new Date().toISOString(),timezone).date;
  const policy=await loadActorPolicyContext(pool,userId,localDate);
  if(!policy) return null;
  const primaryRole=ROLE_PRIORITY.find((role)=>policy.roles.includes(role));
  if(!primaryRole) return null;
  return {
    userId,
    employeeId:row.employee_id,
    displayName:row.employee_name ?? row.name,
    email:row.email,
    avatarUrl:row.image_url,
    roles:policy.roles,
    primaryRole,
    permissions:[...policy.permissions].sort(),
    scopedDivisionIds:[...policy.divisionIds].sort(),
    scopedEmployeeIds:[...policy.employeeIds].filter((id)=>id!==row.employee_id).sort(),
    // `OH-BE-0207`: reported, never fabricated. An expired or future
     // appointment is absent because the policy context resolved it on today's
     // business date.
    departmentLeadScopes:policy.departmentLeadScopes??[],
    timezone,
    locale:'en-GB',
    sessionExpiresAt:expiresAt,
  };
}
