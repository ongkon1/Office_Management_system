import type { Readable } from 'node:stream';
import { providerConfig } from './oauth';

/**
 * Integration catalogue and adapter ports (`BE-0735`, `REQ-INT-001`–`008`).
 *
 * Every external system reaches the product through a port defined here (or,
 * for email, storage and calendars, the ports already implemented), and every
 * port obeys the same three rules:
 *
 * 1. **Inbound data is a proposal.** It enters as a draft, an import batch or
 *    an authenticated API call, and is saved only through the same service an
 *    interactive user would use — same validation, authorization, locks,
 *    calculation and audit (`REQ-INT-008`, `BE-0736`).
 * 2. **Outbound data is minimal.** Events carry identifiers, exports carry
 *    approved fields, and nothing protected leaves without its permission.
 * 3. **Credentials are scoped and encrypted**, connections are auditable, and
 *    a provider is unavailable until it is approved and configured.
 *
 * Only the entries marked `available` are implemented. The rest are contracts
 * waiting for an approved provider and owner sign-off; none is switched on.
 */
export type IntegrationStatus = 'available' | 'requires_approval' | 'not_implemented';

export interface IntegrationEntry {
  readonly key: string;
  readonly label: string;
  readonly category: 'calendar' | 'email' | 'storage' | 'conferencing' | 'work_tracking' | 'chat' | 'attendance' | 'hr' | 'payroll' | 'accounting' | 'identity' | 'automation';
  readonly port: string;
  readonly direction: 'inbound' | 'outbound' | 'both';
  readonly rule: string;
  readonly requirementIds: readonly string[];
}

export const INTEGRATIONS: readonly IntegrationEntry[] = [
  { key: 'google_calendar', label: 'Google Calendar', category: 'calendar', port: 'CalendarProvider', direction: 'inbound', rule: 'Events become employee-only drafts; confirmation saves a work log through the normal rules.', requirementIds: ['REQ-INT-001', 'REQ-INT-002'] },
  { key: 'microsoft_calendar', label: 'Microsoft Outlook Calendar', category: 'calendar', port: 'CalendarProvider', direction: 'inbound', rule: 'Events become employee-only drafts; confirmation saves a work log through the normal rules.', requirementIds: ['REQ-INT-001', 'REQ-INT-002'] },
  { key: 'resend_email', label: 'Transactional email (Resend)', category: 'email', port: 'EmailSender', direction: 'outbound', rule: 'Fixed notification templates only; recipients opt in per type; access rechecked before each send.', requirementIds: ['REQ-NOT-005'] },
  { key: 's3_storage', label: 'Private object storage (S3)', category: 'storage', port: 'ObjectStore', direction: 'both', rule: 'Opaque keys, encrypted at rest, scanned before release, short-lived authorized links.', requirementIds: ['REQ-DOC-004', 'REQ-DOC-005'] },
  { key: 'rest_api', label: 'Versioned REST API', category: 'automation', port: 'ApiTokenService', direction: 'both', rule: 'Scoped personal tokens acting as their owner; writes go through the work-log service.', requirementIds: ['REQ-INT-005', 'REQ-INT-006'] },
  { key: 'webhooks', label: 'Signed webhooks', category: 'automation', port: 'WebhookService', direction: 'outbound', rule: 'Identifier-only events, HMAC-signed, retried, delivered only while the owner can open the record.', requirementIds: ['REQ-INT-005', 'REQ-INT-006'] },
  { key: 'zapier_make', label: 'Zapier and Make', category: 'automation', port: 'REST API + webhooks', direction: 'both', rule: 'Connect through the REST API and webhooks; no separate connector or broader access.', requirementIds: ['REQ-INT-005'] },
  { key: 'gmail_m365', label: 'Gmail / Microsoft 365 mail', category: 'email', port: 'EmailSender', direction: 'outbound', rule: 'A second EmailSender adapter; same templates and opt-in.', requirementIds: ['REQ-INT-003'] },
  { key: 'drive_onedrive', label: 'Google Drive / OneDrive', category: 'storage', port: 'DocumentSourcePort', direction: 'inbound', rule: 'Linked files become document versions only through the document service and its access rules.', requirementIds: ['REQ-INT-003'] },
  { key: 'meet_zoom', label: 'Google Meet / Zoom', category: 'conferencing', port: 'ConferencingPort', direction: 'inbound', rule: 'Meetings may propose calendar-style drafts; never time directly.', requirementIds: ['REQ-INT-003'] },
  { key: 'jira', label: 'Jira', category: 'work_tracking', port: 'IssueTrackerPort', direction: 'both', rule: 'Issues map to tasks through the task service; status changes use task transitions and never create minutes.', requirementIds: ['REQ-INT-003'] },
  { key: 'slack', label: 'Slack', category: 'chat', port: 'ChatNotificationPort', direction: 'outbound', rule: 'Carries the same fixed notification text as email; no record content.', requirementIds: ['REQ-INT-003'] },
  { key: 'biometric', label: 'Biometric attendance', category: 'attendance', port: 'AttendanceSourcePort', direction: 'inbound', rule: 'Punches are attendance evidence for HR review; they never become active work minutes.', requirementIds: ['REQ-INT-004'] },
  { key: 'hr_system', label: 'External HR system', category: 'hr', port: 'HrRecordSourcePort', direction: 'inbound', rule: 'Employee and placement changes arrive as import batches (BE-0912) with dry run and approval.', requirementIds: ['REQ-INT-004'] },
  { key: 'payroll', label: 'Payroll', category: 'payroll', port: 'PayrollExportPort', direction: 'outbound', rule: 'Only HR-verified periods and approved payroll fields (BE-0614); never an implicit submission.', requirementIds: ['REQ-INT-004'] },
  { key: 'accounting', label: 'Accounting', category: 'accounting', port: 'AccountingExportPort', direction: 'outbound', rule: 'Cost data only with cost access; verified periods only.', requirementIds: ['REQ-INT-004'] },
  { key: 'sso', label: 'Single sign-on (OIDC/SAML)', category: 'identity', port: 'IdentityProviderPort', direction: 'inbound', rule: 'Authenticates an existing account only; roles and scopes stay in this system and are never taken from the provider.', requirementIds: ['REQ-INT-007'] },
];

const IMPLEMENTED = new Set(['google_calendar', 'microsoft_calendar', 'resend_email', 's3_storage', 'rest_api', 'webhooks', 'zapier_make']);

/** The live status of each integration in this deployment. */
export function integrationStatus(entry: IntegrationEntry, environment: NodeJS.ProcessEnv = process.env): IntegrationStatus {
  if (!IMPLEMENTED.has(entry.key)) return 'not_implemented';
  if (entry.category === 'calendar') return providerConfig(entry.key, environment) ? 'available' : 'requires_approval';
  if (entry.key === 'resend_email') return environment.RESEND_API_KEY && environment.EMAIL_FROM ? 'available' : 'requires_approval';
  if (entry.key === 's3_storage') return environment.S3_BUCKET || environment.ATTACHMENT_S3_BUCKET ? 'available' : 'requires_approval';
  return 'available';
}

/* ------------------------------------------------------------------------- */
/* Ports for integrations that are defined but not implemented.               */
/* Each will be implemented only after its provider is approved.              */
/* ------------------------------------------------------------------------- */

/** A file held in an external drive, proposed as a document version. */
export interface DocumentSourcePort {
  describe(externalId: string, accessToken: string): Promise<{ readonly name: string; readonly mediaType: string; readonly sizeBytes: number; readonly changeKey: string }>;
  open(externalId: string, accessToken: string): Promise<Readable>;
}

export interface ConferencingPort {
  meetings(accessToken: string, window: { readonly from: string; readonly to: string }): Promise<readonly { readonly id: string; readonly start: string; readonly end: string; readonly title: string }[]>;
}

export interface IssueTrackerPort {
  issues(accessToken: string, query: { readonly projectKey: string; readonly updatedSince: string }): Promise<readonly { readonly id: string; readonly key: string; readonly title: string; readonly status: string; readonly assigneeEmail: string | null }[]>;
}

export interface ChatNotificationPort {
  post(channel: string, message: { readonly title: string; readonly body: string; readonly link: string; readonly idempotencyKey: string }): Promise<{ readonly providerMessageId: string }>;
}

/** Attendance evidence — never active work minutes. */
export interface AttendanceSourcePort {
  punches(window: { readonly from: string; readonly to: string }): Promise<readonly { readonly deviceId: string; readonly employeeCode: string; readonly at: string; readonly direction: 'in' | 'out' }[]>;
}

export interface HrRecordSourcePort {
  extract(asOf: string): Promise<{ readonly manifestSha256: string; readonly rows: AsyncIterable<Readonly<Record<string, string>>> }>;
}

export interface PayrollExportPort {
  submit(periodId: string, payload: { readonly fields: readonly string[]; readonly rows: readonly Readonly<Record<string, string>>[]; readonly idempotencyKey: string }): Promise<{ readonly receiptId: string }>;
}

export interface AccountingExportPort {
  submit(periodId: string, journal: readonly { readonly account: string; readonly amount: string; readonly currency: string; readonly memo: string }[], idempotencyKey: string): Promise<{ readonly receiptId: string }>;
}

/** Proves who someone is; never what they may do. */
export interface IdentityProviderPort {
  authorizationUrl(state: string, nonce: string, codeChallenge: string): string;
  verify(code: string, verifier: string, nonce: string): Promise<{ readonly subject: string; readonly email: string; readonly emailVerified: boolean }>;
}
