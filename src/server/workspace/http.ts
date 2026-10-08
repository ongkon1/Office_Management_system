import { z } from 'zod';
import type { WorkspaceService } from '@/contracts/workspace';
import { resultResponse } from '@/server/time/http';

const METHODS = [
  'getNotifications','markNotificationRead','markAllNotificationsRead','search','listRecentSearches',
  'getDocuments','downloadDocument','getMessages','getWfhSelfService','submitWfhRequest','cancelRequest',
  'getLeaveSelfService','submitLeaveRequest','getSelfEvaluation','saveSelfEvaluation',
] as const satisfies readonly (keyof WorkspaceService)[];
const command = z.object({ method: z.enum(METHODS), args: z.array(z.unknown()).max(4) }).strict();

export async function handleWorkspaceRequest(request: Request, service: WorkspaceService, expectedOrigin: string) {
  if (request.headers.get('origin') !== new URL(expectedOrigin).origin) {
    return resultResponse({ status:'permission_denied', code:'FORBIDDEN', message:'The request origin is not allowed.' });
  }
  try {
    const parsed=command.safeParse(await request.json());
    if(!parsed.success)return resultResponse({status:'validation_failure',code:'VALIDATION_FAILED',message:'Choose a supported workspace operation.',fieldErrors:[{field:'method',code:'INVALID_VALUE',message:'The workspace operation is invalid.',guidance:'Reload the page and try again.'}]});
    return resultResponse(await Reflect.apply(Reflect.get(service,parsed.data.method),service,parsed.data.args));
  } catch {
    return resultResponse({status:'error',code:'DEPENDENCY_FAILED',message:'The workspace operation could not be completed.',retryable:true});
  }
}
