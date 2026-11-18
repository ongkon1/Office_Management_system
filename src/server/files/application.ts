import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatTimestamp } from '@/lib/format';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { isReadOnly } from '@/server/authorization/record-access';
import { recordAudit } from '@/server/audit/record';
import { businessDate, conflict, denied, guarded, invalid, notFound } from '@/server/supporting/results';
import { ownerAccess } from './owners';
import { MEDIA_RULES, OWNER_POLICY, OWNER_TYPES, checkUpload, contentMatchesType, sizeLabel, type AttachmentOwnerType } from './policy';
import type { DownloadTarget, ObjectStore, UploadTarget } from './storage';
import type { MalwareScanner } from './scanner';

type Row = RowDataPacket & Record<string, unknown>;

export interface AttachmentView {
  readonly id: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly mediaTypeLabel: string;
  readonly sizeBytes: number;
  readonly sizeLabel: string;
  /** `available` is the only state in which the file can be downloaded. */
  readonly state: 'uploading' | 'scanning' | 'available' | 'rejected' | 'expired';
  readonly uploadedAtLabel: string;
}

export interface InitiateUploadInput {
  readonly ownerType: AttachmentOwnerType;
  readonly ownerId: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  /** Hex SHA-256 computed by the client; the server verifies it at completion. */
  readonly sha256: string;
}

const HEAD_BYTES = 4096;
const MAX_SCAN_ATTEMPTS = 3;
const objectKey = (now: string, id: string) => `files/${now.slice(0, 4)}/${now.slice(5, 7)}/${id}`;

function view(row: Row): AttachmentView {
  const scan = String(row.scan_status), upload = String(row.upload_state);
  const state: AttachmentView['state'] = upload === 'initiated' ? 'uploading' : upload === 'expired' ? 'expired'
    : scan === 'clean' ? 'available' : scan === 'rejected' || scan === 'failed' ? 'rejected' : 'scanning';
  const created = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return {
    id: String(row.id), fileName: String(row.original_name), mediaType: String(row.media_type),
    mediaTypeLabel: MEDIA_RULES[String(row.media_type)]?.label ?? 'File',
    sizeBytes: Number(row.size_bytes), sizeLabel: sizeLabel(Number(row.size_bytes)), state, uploadedAtLabel: formatTimestamp(created),
  };
}

/** Read the whole object once: integrity hash, size and the leading bytes for type sniffing. */
async function inspect(body: Readable) {
  const hash = createHash('sha256');
  let size = 0;
  const head: Buffer[] = [];
  let headSize = 0;
  for await (const chunk of body) {
    const data = Buffer.from(chunk as Buffer);
    hash.update(data);
    size += data.length;
    if (headSize < HEAD_BYTES) { head.push(data.subarray(0, HEAD_BYTES - headSize)); headSize += Math.min(data.length, HEAD_BYTES - headSize); }
  }
  return { sha256: hash.digest('hex'), sizeBytes: size, head: Buffer.concat(head) };
}

/**
 * Attachments (`BE-0710`–`BE-0712`).
 *
 * Lifecycle: **initiate** validates type, size and name, checks the actor may
 * attach to the owner, and reserves an opaque key with a short upload window;
 * the bytes go to storage directly (S3) or through `receive` (local store);
 * **complete** re-reads the object and refuses it unless its size, SHA-256 and
 * leading bytes match what was declared; a **scan** worker then marks it clean
 * or rejected. Only a clean, active attachment can be downloaded, and every
 * download re-checks access to the owning record before issuing a 60-second
 * link or stream. Each step is audited.
 */
export class FileApplication {
  constructor(
    private readonly pool: Pool,
    private readonly store: ObjectStore,
    private readonly scanner: MalwareScanner | null,
    private readonly options: { readonly now?: () => string; readonly uploadWindowSeconds?: number; readonly downloadSeconds?: number } = {},
  ) {}

  private now() { return this.options.now?.() ?? new Date().toISOString(); }
  private date() { return businessDate(this.now()); }

  private async row(id: string) {
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM attachments WHERE id=?', [id]);
    return rows[0] ?? null;
  }

  initiate(actor: ActorPolicyContext, input: InitiateUploadInput): Promise<Result<{ readonly attachment: AttachmentView; readonly upload: UploadTarget }>> {
    return guarded(async () => {
      if (!OWNER_TYPES.includes(input.ownerType)) return invalid('ownerType', 'Choose what the file belongs to.', 'Attach the file from the record it belongs to.');
      if (isReadOnly(actor)) return denied('View-only access cannot upload files.');
      const access = await ownerAccess(this.pool, actor, input.ownerType, input.ownerId, this.date());
      if (!access.read) return notFound('record');
      if (!access.attach) return denied('You cannot attach files to this record.');
      const checked = checkUpload(input);
      if (!checked.ok) return invalid(checked.field, checked.message, checked.guidance);
      const id = randomUUID();
      const now = this.now();
      const key = objectKey(now, id);
      const windowSeconds = this.options.uploadWindowSeconds ?? 900;
      const expires = new Date(Date.parse(now) + windowSeconds * 1000);
      await this.pool.execute(
        `INSERT INTO attachments(id,owner_type,owner_id,uploaded_by_user_id,storage_key,original_name,media_type,size_bytes,sha256,upload_state,upload_expires_at,scan_status,sensitivity)
         VALUES(?,?,?,?,?,?,?,?,?,'initiated',?,'pending','protected')`,
        [id, input.ownerType, input.ownerId, actor.userId, key, checked.fileName, input.mediaType, input.sizeBytes, input.sha256, expires]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'file.upload_initiated', resourceType: 'attachment', resourceId: id,
        scope: { ownerType: input.ownerType, ownerId: input.ownerId }, after: { mediaType: input.mediaType, sizeBytes: input.sizeBytes } });
      const upload = await this.store.uploadTarget(key, { attachmentId: id, mediaType: input.mediaType, sizeBytes: input.sizeBytes, sha256: input.sha256, expiresSeconds: windowSeconds });
      return success({ attachment: view((await this.row(id))!), upload });
    });
  }

  /** Local store only: the bytes of an initiated upload, from its uploader, inside its window. */
  receive(actor: ActorPolicyContext, id: string, body: Readable): Promise<Result<{ readonly received: number }>> {
    return guarded(async () => {
      if (!this.store.receivesThroughApplication) return conflict('This upload goes directly to storage.', 'Use the upload address returned when the upload started.');
      const row = await this.row(id);
      if (!row || row.uploaded_by_user_id !== actor.userId) return notFound('upload');
      if (row.upload_state !== 'initiated' || Date.parse(String(row.upload_expires_at instanceof Date ? row.upload_expires_at.toISOString() : row.upload_expires_at)) < Date.parse(this.now()))
        return conflict('This upload is no longer open.', 'Start the upload again.');
      try {
        return success({ received: await this.store.write(String(row.storage_key), body, Number(row.size_bytes)) });
      } catch (error) {
        if ((error as Error).message === 'FILE_TOO_LARGE') return invalid('sizeBytes', 'The file is larger than declared.', 'Start the upload again with the file you selected.');
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return conflict('This upload has already been received.', 'Complete the upload.');
        throw error;
      }
    });
  }

  complete(actor: ActorPolicyContext, id: string): Promise<Result<AttachmentView>> {
    return guarded(async () => {
      const row = await this.row(id);
      if (!row || row.uploaded_by_user_id !== actor.userId) return notFound('upload');
      if (row.upload_state === 'completed') return success(view(row));
      if (row.upload_state !== 'initiated') return conflict('This upload has expired.', 'Start the upload again.');
      const key = String(row.storage_key);
      const stored = await this.store.stat(key);
      if (!stored) return conflict('The file has not arrived yet.', 'Finish sending the file, then complete the upload.');
      const facts = await inspect(await this.store.read(key));
      const reason = facts.sizeBytes !== Number(row.size_bytes) ? 'size_mismatch'
        : facts.sha256 !== String(row.sha256) ? 'integrity_mismatch'
          : !contentMatchesType(String(row.media_type), facts.head) ? 'type_mismatch' : null;
      if (reason) {
        await this.store.delete(key);
        await this.pool.execute("UPDATE attachments SET upload_state='completed',completed_at=UTC_TIMESTAMP(6),scan_status='rejected',safe_scan_code=?,version=version+1 WHERE id=?", [reason, id]);
        await recordAudit(this.pool, { actorUserId: actor.userId, action: 'file.rejected', resourceType: 'attachment', resourceId: id, after: { reason } });
        return invalid('file', reason === 'type_mismatch' ? 'The file content does not match its type.' : 'The file changed or was damaged while uploading.',
          reason === 'type_mismatch' ? 'Save the file in the stated format and upload it again.' : 'Upload the file again.');
      }
      await this.pool.execute("UPDATE attachments SET upload_state='completed',completed_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=? AND upload_state='initiated'", [id]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'file.upload_completed', resourceType: 'attachment', resourceId: id });
      return success(view((await this.row(id))!));
    });
  }

  /** Worker: scan completed uploads. Infected files are deleted; repeated scanner errors fail closed. */
  async scanPending(limit = 20) {
    const summary = { clean: 0, rejected: 0, failed: 0, waiting: 0 };
    if (!this.scanner) return summary;
    const [rows] = await this.pool.query<Row[]>(
      "SELECT id,storage_key,scan_attempts FROM attachments WHERE upload_state='completed' AND scan_status='pending' AND deactivated_at IS NULL ORDER BY completed_at LIMIT ?", [limit]);
    for (const row of rows) {
      // Claim by bumping the attempt counter; a concurrent worker loses the race.
      const [claimed] = await this.pool.execute<ResultSetHeader>(
        "UPDATE attachments SET scan_attempts=scan_attempts+1 WHERE id=? AND scan_status='pending' AND scan_attempts=?", [row.id, row.scan_attempts]);
      if (claimed.affectedRows !== 1) continue;
      const verdict = await this.scanner.scan(await this.store.read(String(row.storage_key))).catch(() => ({ verdict: 'error' as const, code: 'read_failed' }));
      if (verdict.verdict === 'clean') {
        await this.pool.execute("UPDATE attachments SET scan_status='clean',scanned_at=UTC_TIMESTAMP(6),safe_scan_code=NULL,version=version+1 WHERE id=?", [row.id]);
        summary.clean += 1;
      } else if (verdict.verdict === 'infected') {
        await this.store.delete(String(row.storage_key));
        await this.pool.execute("UPDATE attachments SET scan_status='rejected',scanned_at=UTC_TIMESTAMP(6),safe_scan_code=?,version=version+1 WHERE id=?", [verdict.code, row.id]);
        await recordAudit(this.pool, { actorUserId: null, action: 'file.malware_rejected', resourceType: 'attachment', resourceId: String(row.id), after: { code: verdict.code } });
        summary.rejected += 1;
      } else if (Number(row.scan_attempts) + 1 >= MAX_SCAN_ATTEMPTS) {
        await this.pool.execute("UPDATE attachments SET scan_status='failed',scanned_at=UTC_TIMESTAMP(6),safe_scan_code=?,version=version+1 WHERE id=?", [verdict.code, row.id]);
        summary.failed += 1;
      } else {
        await this.pool.execute('UPDATE attachments SET safe_scan_code=? WHERE id=?', [verdict.code, row.id]);
        summary.waiting += 1;
      }
    }
    return summary;
  }

  /** Worker: close upload windows that lapsed and remove anything they left behind. */
  async expireStale(limit = 100) {
    const [rows] = await this.pool.query<Row[]>("SELECT id,storage_key FROM attachments WHERE upload_state='initiated' AND upload_expires_at<? LIMIT ?", [new Date(this.now()), limit]);
    for (const row of rows) {
      await this.store.delete(String(row.storage_key)).catch(() => undefined);
      await this.pool.execute("UPDATE attachments SET upload_state='expired',version=version+1 WHERE id=? AND upload_state='initiated'", [row.id]);
    }
    return rows.length;
  }

  /** Clean, active attachments of one owner — empty, not refused, when the owner is out of reach. */
  listForOwner(actor: ActorPolicyContext, ownerType: AttachmentOwnerType, ownerId: string): Promise<Result<readonly AttachmentView[]>> {
    return guarded(async () => {
      if (!OWNER_TYPES.includes(ownerType)) return invalid('ownerType', 'Choose what the files belong to.', 'Open the record first.');
      const access = await ownerAccess(this.pool, actor, ownerType, ownerId, this.date());
      if (!access.read) return notFound('record');
      // Others' in-flight or rejected uploads are not shown; your own are, so you can see their state.
      const [rows] = await this.pool.execute<Row[]>(
        `SELECT * FROM attachments WHERE owner_type=? AND owner_id=? AND deactivated_at IS NULL
         AND (scan_status='clean' OR uploaded_by_user_id=?) ORDER BY created_at`, [ownerType, ownerId, actor.userId]);
      return success(rows.map(view));
    });
  }

  download(actor: ActorPolicyContext, id: string): Promise<Result<DownloadTarget & { readonly fileName: string; readonly mediaType: string }>> {
    return guarded(async () => {
      const row = await this.row(id);
      if (!row || row.deactivated_at) return notFound('file');
      const ownerType = String(row.owner_type) as AttachmentOwnerType;
      if (!OWNER_TYPES.includes(ownerType)) return notFound('file');
      const access = await ownerAccess(this.pool, actor, ownerType, String(row.owner_id), this.date());
      if (!access.read) return notFound('file');
      if (row.upload_state !== 'completed' || row.scan_status !== 'clean') return conflict('This file is not available yet.', 'It becomes available once security scanning finishes.');
      const target = await this.store.downloadTarget(String(row.storage_key), {
        fileName: String(row.original_name), mediaType: String(row.media_type), expiresSeconds: this.options.downloadSeconds ?? 60,
      });
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'file.downloaded', resourceType: 'attachment', resourceId: id,
        scope: { ownerType, ownerId: String(row.owner_id) } });
      return success({ ...target, fileName: String(row.original_name), mediaType: String(row.media_type) });
    });
  }

  deactivate(actor: ActorPolicyContext, id: string, reason: string): Promise<Result<AttachmentView>> {
    return guarded(async () => {
      const row = await this.row(id);
      if (!row || row.deactivated_at) return notFound('file');
      const access = await ownerAccess(this.pool, actor, String(row.owner_type) as AttachmentOwnerType, String(row.owner_id), this.date());
      if (!access.read) return notFound('file');
      const uploaderMayRemove = row.owner_type !== 'conveyance_claim' && row.uploaded_by_user_id === actor.userId;
      if (!(access.attach || uploaderMayRemove) || isReadOnly(actor)) return denied('You cannot remove this file.');
      if (!reason.trim()) return invalid('reason', 'Say why the file is being removed.', 'A short reason is kept in the audit trail.');
      await this.pool.execute('UPDATE attachments SET deactivated_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=? AND deactivated_at IS NULL', [id]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'file.deactivated', resourceType: 'attachment', resourceId: id, reason: reason.trim() });
      return success(view((await this.row(id))!));
    });
  }

  /** Owner-policy facts for a client building an upload control. */
  static policyFor(ownerType: AttachmentOwnerType) {
    const policy = OWNER_POLICY[ownerType];
    return { maxBytes: policy.maxBytes, mediaTypes: policy.mediaTypes, extensions: policy.mediaTypes.flatMap((type) => MEDIA_RULES[type].extensions) };
  }
}
