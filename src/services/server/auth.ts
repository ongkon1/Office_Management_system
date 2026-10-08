import type { SessionUser } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import type { AuthService, LoginInput } from '@/contracts/services';

type Action = 'login'|'verify-two-factor'|'resend-two-factor'|'request-password-reset'|'reset-password'|'change-password'|'refresh'|'logout';

const networkFailure = <T>(): Result<T> => ({status:'error',code:'DEPENDENCY_FAILED',message:'Authentication is unavailable right now.',retryable:true});

async function request<T>(action?:Action,payload:Record<string,unknown>={}):Promise<Result<T>> {
  try {
    const response=await fetch('/api/auth',action ? {method:'POST',credentials:'include',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})}:{credentials:'include',cache:'no-store'});
    return await response.json() as Result<T>;
  } catch { return networkFailure<T>(); }
}

export const serverAuthService: AuthService = {
  getSession:()=>request<SessionUser|null>(),
  login:(input:LoginInput)=>request('login',{input}),
  verifyTwoFactor:(input)=>request('verify-two-factor',{input}),
  resendTwoFactorCode:()=>request('resend-two-factor'),
  requestPasswordReset:(input)=>request('request-password-reset',{input}),
  resetPassword:(input)=>request('reset-password',{input}),
  changePassword:(input)=>request('change-password',{input}),
  refreshSession:()=>request('refresh'),
  logout:()=>request('logout'),
};
