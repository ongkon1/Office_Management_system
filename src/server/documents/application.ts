import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { DocumentItemView } from '@/contracts/workspace';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatTimestamp } from '@/lib/format';
import { hasPermission, type ActorPolicyContext } from '@/server/authorization/policy';
import {
  canSeeGovernment,
  divisionReach,
  documentReach,
  isOrganizationWide,
  isReadOnly,
  projectReach,
} from '@/server/authorization/record-access';
import { recordAudit } from '@/server/audit/record';
import { businessDate, conflict, denied, guarded, invalid, notFound } from '@/server/supporting/results';
import type { FileApplication } from '@/server/files/application';
import { MEDIA_RULES, sizeLabel } from '@/server/files/policy';
import type { DownloadTarget } from '@/server/files/storage';

type Row = RowDataPacket & Record<string, unknown>;

/** `REQ-DOC-001`. */
export const DOCUMENT_CATEGORIES = [
  'policy', 'handbook', 'guideline', 'procedure', 'training', 'government', 'template', 'meeting_notes', 'client_instructions', 'faq', 'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const CATEGORY_LABEL: Readonly<Record<DocumentCategory, string>> = {
  policy: 'Company policy', handbook: 'Employee handbook', guideline: 'Division guideline', procedure: 'Procedure',
  training: 'Training material', government: 'Government project', template: 'Template', meeting_notes: 'Meeting notes',
  client_instructions: 'Client instructions', faq: 'FAQ', other: 'Other',
};

export type DocumentSensitivity = 'protected' | 'government';

export interface DocumentVersionView {
  readonly number: number;
  readonly kind: 'file' | 'link';
  readonly attachmentId: string | null;
  readonly fileName: string | null;
  readonly sizeLabel: string | null;
  readonly link: string | null;
  readonly changeNote: string | null;
  readonly createdAtLabel: string;
  readonly createdByLabel: string;
}

export interface DocumentDetailView {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: DocumentCategory;
  readonly categoryLabel: string;
  readonly scope: 'company' | 'division' | 'project';
  readonly divisionId: string | null;
  readonly projectId: string | null;
  readonly sensitivity: DocumentSensitivity;
  readonly isActive: boolean;
  readonly canManage: boolean;
  readonly version: number;
  readonly currentVersion: number;
  readonly versions: readonly DocumentVersionView[];
  readonly ownerLabel: string;
  readonly updatedAtLabel: string;
}

export interface CreateDocumentInput {
  readonly title: string;
  readonly description: string;
  readonly category: DocumentCategory;
  readonly scope: 'company' | 'division' | 'project';
  readonly divisionId: string | null;
  readonly projectId: string | null;
  readonly sensitivity: DocumentSensitivity;
  /** A link-only first version; a file version is added after its upload completes. */
  readonly externalLink: string | null;
}

export type DocumentDownload =
  | { readonly kind: 'link'; readonly url: string }
  | (DownloadTarget & { readonly fileName: string; readonly mediaType: string });

const stamp = (value: unknown) => formatTimestamp(value instanceof Date ? value.toISOString() : String(value));

function validLink(link: string) {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && link.length <= 1024;
  } catch { return false; }
}

/**
 * Documents (`BE-0713`, `BE-0715`, `REQ-DOC-001`–`005`).
 *
 * A document has a scope (company, one division's private area, or one
 * project), a category, an access level and a version history. Each version is
 * either a clean uploaded file or an `https` link; versions are appended, never
 * replaced, and a document is deactivated rather than deleted. Every read goes
 * through `documentReach`, so a government document — by its own sensitivity
 * or its division's — does not exist for someone without that permission, and
 * a deactivated one exists only for the people who manage it. Downloads and
 * access changes are audited (`REQ-DOC-005`).
 */
export class DocumentApplication {
  constructor(private readonly pool: Pool, private readonly files: FileApplication, private readonly now = () => new Date().toISOString(),
    private readonly afterChange: (documentId: string) => Promise<void> = async () => undefined) {}

  private date() { return businessDate(this.now()); }

  private async transaction<T>(work: (db: PoolConnection) => Promise<Result<T>>): Promise<Result<T>> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      if (result.status === 'success') await connection.commit(); else await connection.rollback();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Whether the actor may create a document in this scope (the document does not exist yet). */
  private async canCreate(actor: ActorPolicyContext, input: Pick<CreateDocumentInput, 'scope' | 'divisionId' | 'projectId' | 'sensitivity'>) {
    if (isReadOnly(actor)) return false;
    if (input.sensitivity === 'government' && !canSeeGovernment(actor)) return false;
    if (input.scope === 'company') return isOrganizationWide(actor) || hasPermission(actor, 'document.manage');
    if (input.scope === 'division' && input.divisionId) {
      const reach = await divisionReach(this.pool, actor, input.divisionId);
      return Boolean(reach) && (isOrganizationWide(actor) || hasPermission(actor, 'document.manage')
        || (actor.roles.includes('team_lead') && actor.divisionIds.has(input.divisionId)));
    }
    if (input.scope === 'project' && input.projectId) return Boolean((await projectReach(this.pool, actor, input.projectId, this.date()))?.canModerate);
    return false;
  }

  private async detail(actor: ActorPolicyContext, id: string): Promise<DocumentDetailView | null> {
    const reach = await documentReach(this.pool, actor, id, this.date());
    if (!reach) return null;
    const [rows] = await this.pool.execute<Row[]>('SELECT d.*,u.name owner_name FROM documents d JOIN users u ON u.id=d.created_by_user_id WHERE d.id=?', [id]);
    const row = rows[0];
    const [versions] = await this.pool.execute<Row[]>(
      `SELECT v.*,a.original_name,a.size_bytes,a.scan_status,u.name author FROM document_versions v
       LEFT JOIN attachments a ON a.id=v.attachment_id JOIN users u ON u.id=v.created_by_user_id
       WHERE v.document_id=? ORDER BY v.version_number DESC`, [id]);
    return {
      id, title: String(row.title), description: row.description ? String(row.description) : null,
      category: String(row.category) as DocumentCategory, categoryLabel: CATEGORY_LABEL[String(row.category) as DocumentCategory] ?? 'Other',
      scope: reach.scope, divisionId: reach.divisionId, projectId: reach.projectId,
      sensitivity: String(row.sensitivity) === 'government' ? 'government' : 'protected',
      isActive: reach.isActive, canManage: reach.canManage, version: Number(row.version), currentVersion: Number(row.current_version_number),
      versions: versions.map((v) => ({
        number: Number(v.version_number), kind: v.attachment_id ? 'file' : 'link',
        attachmentId: v.attachment_id ? String(v.attachment_id) : null, fileName: v.original_name ? String(v.original_name) : null,
        sizeLabel: v.size_bytes != null ? sizeLabel(Number(v.size_bytes)) : null, link: v.external_link ? String(v.external_link) : null,
        changeNote: v.change_note ? String(v.change_note) : null, createdAtLabel: stamp(v.created_at), createdByLabel: String(v.author),
      })),
      ownerLabel: String(row.owner_name), updatedAtLabel: stamp(row.updated_at),
    };
  }

  get(actor: ActorPolicyContext, id: string): Promise<Result<DocumentDetailView>> {
    return guarded(async () => {
      const document = await this.detail(actor, id);
      return document ? success(document) : notFound('document');
    });
  }

  /**
   * The library (`FE-0723` contract): active documents the viewer can read,
   * each with its current version. Authorization runs per document before
   * anything is grouped or counted.
   */
  library(actor: ActorPolicyContext, filters: { readonly term?: string; readonly scopes?: readonly string[] } = {}): Promise<Result<readonly DocumentItemView[]>> {
    return guarded(async () => {
      const values: string[] = [];
      let where = 'd.is_active=TRUE';
      if (filters.term?.trim()) {
        const pattern = `%${filters.term.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        where += " AND (d.title LIKE ? ESCAPE '\\\\' OR d.description LIKE ? ESCAPE '\\\\')";
        values.push(pattern, pattern);
      }
      if (filters.scopes?.length) {
        where += ` AND d.scope_type IN (${filters.scopes.map(() => '?').join(',')})`;
        values.push(...filters.scopes);
      }
      const [rows] = await this.pool.execute<Row[]>(
        `SELECT d.id,d.title,d.description,d.scope_type,d.current_version_number,d.updated_at,dv.name division_name,p.name project_name,
          v.external_link,a.original_name,a.media_type,a.size_bytes,a.scan_status,u.name author
         FROM documents d LEFT JOIN divisions dv ON dv.id=d.division_id LEFT JOIN projects p ON p.id=d.project_id
         LEFT JOIN document_versions v ON v.document_id=d.id AND v.version_number=d.current_version_number
         LEFT JOIN attachments a ON a.id=v.attachment_id LEFT JOIN users u ON u.id=v.created_by_user_id
         WHERE ${where} ORDER BY d.updated_at DESC LIMIT 500`, values);
      const items: DocumentItemView[] = [];
      for (const row of rows) {
        if (!(await documentReach(this.pool, actor, String(row.id), this.date()))) continue;
        const scope = String(row.scope_type) as DocumentItemView['scope'];
        const groupLabel = scope === 'company' ? 'Company documents' : scope === 'division' ? String(row.division_name ?? 'Division') : String(row.project_name ?? 'Project');
        const isLink = Boolean(row.external_link);
        const available = isLink || row.scan_status === 'clean';
        items.push({
          id: String(row.id), title: String(row.title), description: row.description ? String(row.description) : null, scope,
          scopeLabel: scope === 'company' ? 'Company' : `${scope === 'division' ? 'Division' : 'Project'}: ${groupLabel}`, groupLabel,
          version: `v${Number(row.current_version_number) || 0}`,
          fileName: isLink ? 'External link' : String(row.original_name ?? 'No file yet'),
          mediaTypeLabel: isLink ? 'Link' : MEDIA_RULES[String(row.media_type)]?.label ?? 'File',
          sizeLabel: isLink || row.size_bytes == null ? '—' : sizeLabel(Number(row.size_bytes)),
          uploadedAtLabel: stamp(row.updated_at), uploadedByLabel: String(row.author ?? 'Not recorded'),
          isRestricted: false, restrictionReason: null,
          canDownload: Number(row.current_version_number) > 0 && available,
          previewPlaceholder: `Preview of ${String(row.title)} is not available. Download it to open.`,
        });
      }
      return success(items);
    });
  }

  create(actor: ActorPolicyContext, input: CreateDocumentInput): Promise<Result<DocumentDetailView>> {
    return guarded(async () => {
      const title = input.title.trim();
      if (!title || title.length > 240) return invalid('title', 'Enter a title of up to 240 characters.', 'Name the document as people will search for it.');
      if (!DOCUMENT_CATEGORIES.includes(input.category)) return invalid('category', 'Choose a category.', 'Pick the closest category from the list.');
      if (!['company', 'division', 'project'].includes(input.scope)) return invalid('scope', 'Choose who the document is for.', 'Company, one division or one project.');
      if (input.scope === 'division' && !input.divisionId) return invalid('divisionId', 'Choose the division.', 'Division documents are private to that division.');
      if (input.scope === 'project' && !input.projectId) return invalid('projectId', 'Choose the project.', 'Project documents are visible to the project.');
      if (input.externalLink && !validLink(input.externalLink)) return invalid('externalLink', 'Enter a secure https link.', 'Copy the full address, starting with https://.');
      if (input.description.length > 5000) return invalid('description', 'Keep the description under 5,000 characters.', 'Summarize; put the detail in the document.');
      if (!(await this.canCreate(actor, input))) return denied('You cannot add documents to this space.');
      const id = randomUUID();
      const result = await this.transaction(async (db) => {
        await db.execute(
          `INSERT INTO documents(id,title,description,category,scope_type,division_id,project_id,sensitivity,created_by_user_id,current_version_number)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [id, title, input.description.trim() || null, input.category, input.scope, input.scope === 'division' ? input.divisionId : null,
            input.scope === 'project' ? input.projectId : null, input.sensitivity, actor.userId, input.externalLink ? 1 : 0]);
        if (input.externalLink) {
          await db.execute('INSERT INTO document_versions(id,document_id,version_number,external_link,created_by_user_id) VALUES(?,?,1,?,?)',
            [randomUUID(), id, input.externalLink, actor.userId]);
        }
        await recordAudit(db, { actorUserId: actor.userId, action: 'document.created', resourceType: 'document', resourceId: id,
          scope: { scope: input.scope, divisionId: input.divisionId, projectId: input.projectId }, after: { title, category: input.category, sensitivity: input.sensitivity } });
        return success(id);
      });
      if (result.status !== 'success') return result;
      await this.afterChange(id);
      return success((await this.detail(actor, id))!);
    });
  }

  private async managed(actor: ActorPolicyContext, id: string, expectedVersion: number) {
    const reach = await documentReach(this.pool, actor, id, this.date());
    if (!reach) return { failure: notFound('document') };
    if (!reach.canManage) return { failure: denied('You cannot change this document.') };
    const [rows] = await this.pool.execute<Row[]>('SELECT version,current_version_number,sensitivity,is_active FROM documents WHERE id=?', [id]);
    if (Number(rows[0].version) !== expectedVersion) return { failure: conflict('The document changed since you opened it.', 'Reload it and apply your change again.') };
    return { row: rows[0], reach };
  }

  update(actor: ActorPolicyContext, id: string, input: { readonly title: string; readonly description: string; readonly category: DocumentCategory; readonly expectedVersion: number }): Promise<Result<DocumentDetailView>> {
    return guarded(async () => {
      const check = await this.managed(actor, id, input.expectedVersion);
      if (check.failure) return check.failure;
      const title = input.title.trim();
      if (!title || title.length > 240) return invalid('title', 'Enter a title of up to 240 characters.', 'Name the document as people will search for it.');
      if (!DOCUMENT_CATEGORIES.includes(input.category)) return invalid('category', 'Choose a category.', 'Pick the closest category from the list.');
      const [result] = await this.pool.execute<ResultSetHeader>(
        'UPDATE documents SET title=?,description=?,category=?,version=version+1 WHERE id=? AND version=?',
        [title, input.description.trim() || null, input.category, id, input.expectedVersion]);
      if (!result.affectedRows) return conflict('The document changed since you opened it.', 'Reload it and apply your change again.');
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'document.updated', resourceType: 'document', resourceId: id, after: { title, category: input.category } });
      await this.afterChange(id);
      return success((await this.detail(actor, id))!);
    });
  }

  /** Append a version: a clean upload owned by this document, or an https link. */
  addVersion(actor: ActorPolicyContext, id: string, input: { readonly attachmentId: string | null; readonly externalLink: string | null; readonly changeNote: string; readonly expectedVersion: number }): Promise<Result<DocumentDetailView>> {
    return guarded(async () => {
      const check = await this.managed(actor, id, input.expectedVersion);
      if (check.failure) return check.failure;
      if (Boolean(input.attachmentId) === Boolean(input.externalLink)) return invalid('attachmentId', 'Add either a file or a link.', 'A version is one file or one https link.');
      if (input.externalLink && !validLink(input.externalLink)) return invalid('externalLink', 'Enter a secure https link.', 'Copy the full address, starting with https://.');
      if (input.changeNote.length > 500) return invalid('changeNote', 'Keep the change note under 500 characters.', 'Say briefly what changed.');
      if (input.attachmentId) {
        const [files] = await this.pool.execute<Row[]>(
          "SELECT id FROM attachments WHERE id=? AND owner_type='document' AND owner_id=? AND upload_state='completed' AND scan_status='clean' AND deactivated_at IS NULL",
          [input.attachmentId, id]);
        if (!files[0]) return invalid('attachmentId', 'The file is not ready to publish.', 'Upload the file to this document and wait for scanning to finish.');
      }
      const result = await this.transaction(async (db) => {
        const [locked] = await db.execute<Row[]>('SELECT current_version_number,version FROM documents WHERE id=? FOR UPDATE', [id]);
        if (Number(locked[0].version) !== input.expectedVersion) return conflict('The document changed since you opened it.', 'Reload it and add the version again.');
        const next = Number(locked[0].current_version_number) + 1;
        await db.execute('INSERT INTO document_versions(id,document_id,version_number,attachment_id,external_link,change_note,created_by_user_id) VALUES(?,?,?,?,?,?,?)',
          [randomUUID(), id, next, input.attachmentId, input.externalLink, input.changeNote.trim() || null, actor.userId]);
        await db.execute('UPDATE documents SET current_version_number=?,version=version+1 WHERE id=?', [next, id]);
        await recordAudit(db, { actorUserId: actor.userId, action: 'document.version_added', resourceType: 'document', resourceId: id, after: { version: next, kind: input.attachmentId ? 'file' : 'link' } });
        return success(next);
      });
      if (result.status !== 'success') return result;
      await this.afterChange(id);
      return success((await this.detail(actor, id))!);
    });
  }

  /** `REQ-DOC-005`: an access-level change is audited with its reason. */
  changeAccess(actor: ActorPolicyContext, id: string, input: { readonly sensitivity: DocumentSensitivity; readonly reason: string; readonly expectedVersion: number }): Promise<Result<DocumentDetailView>> {
    return guarded(async () => {
      const check = await this.managed(actor, id, input.expectedVersion);
      if (check.failure) return check.failure;
      if (!['protected', 'government'].includes(input.sensitivity)) return invalid('sensitivity', 'Choose an access level.', 'Standard, or restricted to government-project access.');
      if (input.sensitivity === 'government' && !canSeeGovernment(actor)) return denied('Only people with government-project access can restrict a document to it.');
      if (!input.reason.trim()) return invalid('reason', 'Say why access is changing.', 'The reason is kept in the audit trail.');
      const before = String(check.row!.sensitivity);
      await this.pool.execute('UPDATE documents SET sensitivity=?,version=version+1 WHERE id=? AND version=?', [input.sensitivity, id, input.expectedVersion]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'document.access_changed', resourceType: 'document', resourceId: id,
        reason: input.reason.trim(), before: { sensitivity: before }, after: { sensitivity: input.sensitivity } });
      await this.afterChange(id);
      const detail = await this.detail(actor, id);
      return detail ? success(detail) : notFound('document');
    });
  }

  setActive(actor: ActorPolicyContext, id: string, input: { readonly active: boolean; readonly reason: string; readonly expectedVersion: number }): Promise<Result<DocumentDetailView>> {
    return guarded(async () => {
      const check = await this.managed(actor, id, input.expectedVersion);
      if (check.failure) return check.failure;
      if (!input.reason.trim()) return invalid('reason', 'Say why.', 'The reason is kept in the audit trail.');
      await this.pool.execute(
        `UPDATE documents SET is_active=?,deactivated_at=${input.active ? 'NULL' : 'UTC_TIMESTAMP(6)'},deactivated_by_user_id=?,version=version+1 WHERE id=? AND version=?`,
        [input.active, input.active ? null : actor.userId, id, input.expectedVersion]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: input.active ? 'document.reactivated' : 'document.deactivated', resourceType: 'document', resourceId: id, reason: input.reason.trim() });
      await this.afterChange(id);
      return success((await this.detail(actor, id))!);
    });
  }

  /** The current version: a link is returned as-is; a file goes through the attachment download. */
  download(actor: ActorPolicyContext, id: string): Promise<Result<DocumentDownload>> {
    return guarded<DocumentDownload>(async () => {
      const reach = await documentReach(this.pool, actor, id, this.date());
      if (!reach || !reach.isActive) return notFound('document');
      const [rows] = await this.pool.execute<Row[]>(
        'SELECT v.attachment_id,v.external_link FROM documents d JOIN document_versions v ON v.document_id=d.id AND v.version_number=d.current_version_number WHERE d.id=?', [id]);
      if (!rows[0]) return conflict('This document has no published version yet.', 'Ask its owner to add a file or link.');
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'document.downloaded', resourceType: 'document', resourceId: id });
      if (rows[0].external_link) return success({ kind: 'link' as const, url: String(rows[0].external_link) });
      return this.files.download(actor, String(rows[0].attachment_id));
    });
  }
}
