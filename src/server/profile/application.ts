import 'server-only';

import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { OwnProfileView, ProfileService, UpdateOwnProfileInput } from '@/contracts/services';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';

interface ProfileRow extends RowDataPacket {
  user_id:string; employee_code:string; display_name:string; email:string; phone:string|null; job_title:string|null;
  normal_work_mode:OwnProfileView['normalWorkMode']; primary_division_id:string|null; division_count:number; density:OwnProfileView['density']|null;
}
const absent=():Result<never>=>({status:'not_found',code:'NOT_FOUND',message:'Profile was not found.',resource:'profile'});
const invalid=(field:string,message:string,guidance:string):Result<never>=>({status:'validation_failure',code:'VALIDATION_FAILED',message,focusField:field,fieldErrors:[{field,code:'INVALID_VALUE',message,guidance}]});

export class BackendProfileService implements ProfileService {
  private readonly auth:AuthenticationService;
  constructor(private readonly pool:Pool,private readonly sessionToken:string){this.auth=new AuthenticationService(new MysqlAuthenticationStore(pool));}
  private async owns(userId:string){const session=await this.auth.validateSession(this.sessionToken);return session.status==='success'&&session.data.userId===userId;}
  private async read(userId:string):Promise<Result<OwnProfileView>>{
    const [rows]=await this.pool.execute<ProfileRow[]>(`SELECT u.id user_id,e.employee_code,e.display_name,u.email,e.phone,e.job_title,e.normal_work_mode,
      MAX(CASE WHEN a.is_primary=TRUE THEN a.division_id END) primary_division_id,COUNT(DISTINCT a.division_id) division_count,up.density
      FROM users u JOIN employees e ON e.user_id=u.id LEFT JOIN employee_division_assignments a ON a.employee_id=e.id AND a.is_active=TRUE
      AND a.effective_from<=CURRENT_DATE AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE)
      LEFT JOIN user_preferences up ON up.user_id=u.id WHERE u.id=? AND u.status='active'
      GROUP BY u.id,e.employee_code,e.display_name,u.email,e.phone,e.job_title,e.normal_work_mode,up.density`,[userId]);
    const row=rows[0];if(!row)return absent();return success({userId:row.user_id,employeeCode:row.employee_code,fullName:row.display_name,email:row.email,phone:row.phone??'',designation:row.job_title??'',primaryDivisionId:row.primary_division_id??'',divisionCount:Number(row.division_count),normalWorkMode:row.normal_work_mode,density:row.density??'comfortable'});
  }
  async getOwnProfile(userId:string){if(!await this.owns(userId))return absent();return this.read(userId);}
  async updateOwnProfile(userId:string,input:UpdateOwnProfileInput){if(!await this.owns(userId))return absent();if(input.fullName.trim().length<2)return invalid('fullName','Enter your full name.','Use at least two characters.');if(!/^\S+@\S+\.\S+$/.test(input.email))return invalid('email','Enter a valid email address.','Use an address such as name@example.com.');
    const connection=await this.pool.getConnection();try{await connection.beginTransaction();const [duplicate]=await connection.execute<RowDataPacket[]>('SELECT id FROM users WHERE email_normalized=LOWER(?) AND id<>? LIMIT 1',[input.email,userId]);if(duplicate[0])return invalid('email','That email address is already in use.','Use another email address or contact an administrator.');await connection.execute('UPDATE users SET name=?,email=?,email_normalized=LOWER(?),version=version+1 WHERE id=?',[input.fullName.trim(),input.email.trim(),input.email.trim(),userId]);await connection.execute('UPDATE employees SET display_name=?,phone=?,normal_work_mode=?,version=version+1 WHERE user_id=?',[input.fullName.trim(),input.phone.trim()||null,input.normalWorkMode,userId]);await connection.execute(`INSERT INTO user_preferences(user_id,density,recent_searches) VALUES(?,?,JSON_ARRAY()) ON DUPLICATE KEY UPDATE density=VALUES(density),version=version+1`,[userId,input.density]);await connection.commit();return this.read(userId);}catch(error){await connection.rollback();throw error;}finally{connection.release();}}
}
