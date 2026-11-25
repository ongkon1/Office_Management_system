import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { TaskCategory, TaskCategoryCommand } from '@/contracts/task-categories';
import { success, type Result } from '@/contracts/results';
import { indistinguishableNotFound } from '@/server/authorization/policy';
import { AuditWriter, MysqlAuditSink } from '@/server/audit/writer';
import { invalid } from '@/server/time/validation';

const view = (row: RowDataPacket): TaskCategory => ({
  id: String(row.id), name: String(row.name), isActive: Boolean(row.is_active),
});

export async function isActiveTaskCategory(db: Pool | PoolConnection, id: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT id FROM task_categories WHERE id=? AND is_active=TRUE FOR SHARE', [id],
  );
  return rows.length === 1;
}

async function list(db: Pool | PoolConnection, includeArchived: boolean) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id,name,is_active FROM task_categories ${includeArchived ? '' : 'WHERE is_active=TRUE'} ORDER BY is_active DESC,name`,
  );
  return rows.map(view);
}

export async function manageTaskCategories(
  pool: Pool, actor: { userId: string; isAdmin: boolean }, command: TaskCategoryCommand,
): Promise<Result<readonly TaskCategory[]>> {
  if (command.action === 'list') {
    if (command.includeArchived && !actor.isAdmin) return indistinguishableNotFound();
    return success(await list(pool, Boolean(command.includeArchived)));
  }
  if (!actor.isAdmin) return indistinguishableNotFound();
  const name = 'name' in command ? command.name.trim().replace(/\s+/gu, ' ') : null;
  if (name !== null && (!name || name.length > 120)) {
    return invalid('name', 'Enter a category name of up to 120 characters.');
  }
  const id = command.action === 'create' ? randomUUID() : command.id;
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT id,name,is_active FROM task_categories WHERE id=? FOR UPDATE', [id],
    );
    const before = rows[0] ? view(rows[0]) : null;
    if (command.action !== 'create' && !before) {
      await db.rollback();
      return indistinguishableNotFound();
    }
    if (command.action === 'create') {
      await db.execute('INSERT INTO task_categories(id,name) VALUES(?,?)', [id, name]);
    } else if (command.action === 'rename') {
      await db.execute('UPDATE task_categories SET name=? WHERE id=?', [name, id]);
    } else {
      await db.execute('UPDATE task_categories SET is_active=? WHERE id=?', [command.isActive, id]);
    }
    const categories = await list(db, true);
    await new AuditWriter(new MysqlAuditSink(db)).append({
      actorUserId: actor.userId, action: `task_category.${command.action}`,
      resourceType: 'task_category', resourceId: id, scope: {}, correlationId: randomUUID(),
      before, after: categories.find(category => category.id === id) ?? null,
    });
    await db.commit();
    return success(categories);
  } catch (error) {
    await db.rollback();
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      return invalid('name', 'A category with that name already exists. Check the archived list too.');
    }
    throw error;
  } finally {
    db.release();
  }
}
