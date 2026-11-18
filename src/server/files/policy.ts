/**
 * Upload policy (`BE-0710`): which files are accepted, how large, and what a
 * file must actually contain to be the type it claims.
 *
 * Deliberately narrow. Office documents, PDFs, common images and plain text
 * cover every requirement in `project_requirement.md` §6; executables, HTML,
 * SVG and archives are refused because a browser or desktop can run them.
 */
export type AttachmentOwnerType =
  | 'profile'
  | 'time_entry'
  | 'wfh_request'
  | 'leave_request'
  | 'project'
  | 'task'
  | 'remark'
  | 'evaluation'
  | 'message'
  | 'document'
  | 'conveyance_claim';

export const OWNER_TYPES: readonly AttachmentOwnerType[] = [
  'profile', 'time_entry', 'wfh_request', 'leave_request', 'project', 'task', 'remark', 'evaluation', 'message', 'document', 'conveyance_claim',
];

/**
 * Owners whose record does not exist yet when the file is attached — a work
 * log or request is saved after its evidence is uploaded. Their `owner_id` is
 * the employee the record will belong to, and the saving service links the
 * file by id once it has checked it is that employee's clean upload.
 */
export const EMPLOYEE_OWNED: ReadonlySet<AttachmentOwnerType> = new Set(['profile', 'time_entry', 'wfh_request', 'leave_request', 'conveyance_claim']);

const ZIP = (head: Buffer) => head.length >= 4 && head.readUInt32BE(0) === 0x504b0304;
const isText = (head: Buffer) => {
  if (head.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, Math.min(head.length, 4096))); return true; } catch { return false; }
};

interface MediaRule {
  readonly extensions: readonly string[];
  readonly label: string;
  /** What the first bytes must look like. Checked after upload, before scan. */
  readonly signature: (head: Buffer) => boolean;
}

export const MEDIA_RULES: Readonly<Record<string, MediaRule>> = {
  'application/pdf': { extensions: ['pdf'], label: 'PDF', signature: (h) => h.subarray(0, 5).toString('latin1') === '%PDF-' },
  'image/png': { extensions: ['png'], label: 'PNG image', signature: (h) => h.length >= 8 && h.readUInt32BE(0) === 0x89504e47 },
  'image/jpeg': { extensions: ['jpg', 'jpeg'], label: 'JPEG image', signature: (h) => h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  'image/webp': { extensions: ['webp'], label: 'WebP image', signature: (h) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP' },
  'text/plain': { extensions: ['txt'], label: 'Text', signature: isText },
  'text/csv': { extensions: ['csv'], label: 'CSV', signature: isText },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extensions: ['docx'], label: 'Word document', signature: ZIP },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extensions: ['xlsx'], label: 'Excel workbook', signature: ZIP },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { extensions: ['pptx'], label: 'PowerPoint presentation', signature: ZIP },
};

const IMAGES = ['image/png', 'image/jpeg', 'image/webp'];
const ALL = Object.keys(MEDIA_RULES);
const MB = 1024 * 1024;

export const OWNER_POLICY: Readonly<Record<AttachmentOwnerType, { readonly maxBytes: number; readonly mediaTypes: readonly string[] }>> = {
  profile: { maxBytes: 5 * MB, mediaTypes: IMAGES },
  time_entry: { maxBytes: 10 * MB, mediaTypes: ALL },
  wfh_request: { maxBytes: 10 * MB, mediaTypes: ALL },
  leave_request: { maxBytes: 10 * MB, mediaTypes: ALL },
  project: { maxBytes: 25 * MB, mediaTypes: ALL },
  task: { maxBytes: 25 * MB, mediaTypes: ALL },
  remark: { maxBytes: 10 * MB, mediaTypes: ALL },
  evaluation: { maxBytes: 10 * MB, mediaTypes: ALL },
  message: { maxBytes: 10 * MB, mediaTypes: ALL },
  document: { maxBytes: 50 * MB, mediaTypes: ALL },
  conveyance_claim: { maxBytes: 5 * MB, mediaTypes: ['image/jpeg', 'image/png', 'application/pdf'] },
};

/**
 * A safe display name, or null. Directory parts, control and reserved
 * characters are removed; the name is never used as a storage key.
 */
export function sanitizeFileName(raw: string): string | null {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (!cleaned || cleaned.length > 200 || !/\.[a-z0-9]{1,8}$/i.test(cleaned)) return null;
  return cleaned;
}

export const extensionOf = (fileName: string) => fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();

export type UploadRefusal = { readonly field: string; readonly message: string; readonly guidance: string };

export function checkUpload(input: { ownerType: AttachmentOwnerType; fileName: string; mediaType: string; sizeBytes: number; sha256: string }):
  { readonly ok: true; readonly fileName: string } | ({ readonly ok: false } & UploadRefusal) {
  const policy = OWNER_POLICY[input.ownerType];
  const fileName = sanitizeFileName(input.fileName);
  if (!fileName) return { ok: false, field: 'fileName', message: 'The file name cannot be used.', guidance: 'Rename the file to a short name with an extension, such as report.pdf.' };
  const rule = MEDIA_RULES[input.mediaType];
  if (!rule || !policy.mediaTypes.includes(input.mediaType)) {
    const allowed = [...new Set(policy.mediaTypes.map((type) => MEDIA_RULES[type].label))].join(', ');
    return { ok: false, field: 'mediaType', message: 'This type of file is not accepted here.', guidance: `Upload one of: ${allowed}.` };
  }
  if (!rule.extensions.includes(extensionOf(fileName))) return { ok: false, field: 'fileName', message: 'The file extension does not match its type.', guidance: `Use a .${rule.extensions[0]} file.` };
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) return { ok: false, field: 'sizeBytes', message: 'The file is empty.', guidance: 'Choose the file again.' };
  if (input.sizeBytes > policy.maxBytes) return { ok: false, field: 'sizeBytes', message: `The file is larger than ${policy.maxBytes / MB} MB.`, guidance: 'Compress the file or split it into smaller parts.' };
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) return { ok: false, field: 'sha256', message: 'The file checksum is missing.', guidance: 'Reload the page and upload again.' };
  return { ok: true, fileName };
}

export const contentMatchesType = (mediaType: string, head: Buffer) => MEDIA_RULES[mediaType]?.signature(head) ?? false;

export function sizeLabel(bytes: number) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}
