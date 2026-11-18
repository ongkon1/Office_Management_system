import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { BackendUserRoleAdmin } from '@/server/admin/user-role-views';
import { CRM, CRM_TASK, EMPLOYEE, GOVERNMENT, GOV_PORTAL, GOV_TASK, POWERINAI, USER, data, phase7Database } from '@/server/test/phase7-fixture';
import { createOperationsService } from './composition';

/**
 * A Super Administrator oversees the whole organisation: every task, every
 * project and every division in detail — government work included, because
 * the role holds every permission. Nobody else gets the division detail.
 */
let env: Awaited<ReturnType<typeof phase7Database>>;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  env = await phase7Database();
  const auth = new AuthenticationService(new MysqlAuthenticationStore(env.pool));
  for (const n of [1, 2, 4]) {
    const session = await auth.issueSession(USER(n), 'oversight-test', null);
    if (session.status !== 'success') throw new Error('session');
    tokens[USER(n)] = session.data.token;
  }
});
afterAll(async () => { await env?.close(); });

describe('Super Administrator oversight', () => {
  it('sees every task and every project, in every division', async () => {
    const service = createOperationsService(env.pool, tokens[USER(1)]);
    const tasks = data(await service.listTasks(USER(1))).map((task) => task.id);
    const [all] = await env.rows('SELECT COUNT(*) n FROM tasks t JOIN projects p ON p.id=t.project_id');
    expect(tasks).toHaveLength(Number(all.n));
    expect(tasks).toEqual(expect.arrayContaining([CRM_TASK, GOV_TASK]));
    expect(data(await service.getTask(USER(1), GOV_TASK)).id).toBe(GOV_TASK);
    const projects = data(await service.listProjects(USER(1)));
    expect(projects.map((project) => project.id)).toEqual(expect.arrayContaining([CRM, GOV_PORTAL]));
    expect(projects.every((project) => project.canManage)).toBe(true);
    expect(data(await service.getProject(USER(1), GOV_PORTAL)).members).toBeDefined();
  });

  it('a Team Lead still sees only their scope, without government work', async () => {
    const tasks = data(await createOperationsService(env.pool, tokens[USER(2)]).listTasks(USER(2))).map((task) => task.id);
    expect(tasks).toContain(CRM_TASK);
    expect(tasks).not.toContain(GOV_TASK);
  });

  it('opens any division in detail: people, projects and open tasks that agree with its counts', async () => {
    const admin = new BackendUserRoleAdmin(env.pool, tokens[USER(1)]);
    const powerinai = data(await admin.getDivision(USER(1), POWERINAI));
    expect(powerinai.division.name).toBe('PowerInAI');
    expect(powerinai.members.map((member) => member.employee.id)).toEqual(expect.arrayContaining([EMPLOYEE(2), EMPLOYEE(3)]));
    expect(powerinai.members.length).toBe(powerinai.division.activeAssignmentCount);
    expect(powerinai.projects.map((project) => project.id)).toContain(CRM);
    expect(powerinai.openTasks.map((task) => task.id)).toContain(CRM_TASK);
    expect(powerinai.openTasks.length).toBe(powerinai.division.openTaskCount);
    const government = data(await admin.getDivision(USER(1), GOVERNMENT));
    expect(government.openTasks.map((task) => task.id)).toContain(GOV_TASK);
    expect((await admin.getDivision(USER(1), '10000000-0000-4000-8000-00000000ffff')).status).toBe('not_found');
  });

  it('refuses division detail to everyone else', async () => {
    for (const n of [2, 4]) {
      expect((await new BackendUserRoleAdmin(env.pool, tokens[USER(n)]).getDivision(USER(n), POWERINAI)).status).toBe('permission_denied');
    }
  });
});
