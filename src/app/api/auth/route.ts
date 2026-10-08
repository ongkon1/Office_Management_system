import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Result } from '@/contracts/results';
import type { SessionUser } from '@/contracts/domain';
import { createAuthenticationService, createTwoFactorService } from '@/server/authentication/composition';
import { loadSessionUser } from '@/server/authentication/session-user';
import { createDatabaseClient } from '@/server/database/client';
import { isTrustedMutation, sessionCookie } from '@/server/security/request';
import { secretHash } from '@/server/security/crypto';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { AuthenticationRateLimiter } from '@/server/authentication/rate-limit';

export const runtime='nodejs';
export const dynamic='force-dynamic';

let database:ReturnType<typeof createDatabaseClient>|undefined;
const db=()=>database ??= createDatabaseClient();
const secure=()=>process.env.NODE_ENV==='production';
const cookieDefinition=()=>sessionCookie(secure());
const sessionToken=(request:NextRequest)=>request.cookies.get(cookieDefinition().name)?.value ?? '';
const challengeCookie=()=>secure()?'__Host-office_2fa':'office_2fa';
const json=<T>(result:Result<T>,status=200)=>NextResponse.json(result,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const unavailable=(reference=randomUUID())=>json({status:'error',code:'DEPENDENCY_FAILED',message:'Authentication is unavailable right now.',retryable:true,reference} as const,503);
const noSession=()=>json({status:'unauthenticated',code:'UNAUTHENTICATED',message:'Sign in to continue.',reason:'no_session'} as const,401);

const bodySchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('login'),input:z.object({identifier:z.string().trim().min(1).max(254),password:z.string().min(1).max(1024),rememberMe:z.boolean()})}),
  z.object({action:z.literal('verify-two-factor'),input:z.object({code:z.string().trim().min(6).max(64)})}),
  z.object({action:z.literal('resend-two-factor')}),
  z.object({action:z.literal('request-password-reset'),input:z.object({email:z.string().trim().email().max(254)})}),
  z.object({action:z.literal('reset-password'),input:z.object({identifier:z.string().trim().min(1).max(254),token:z.string().min(1).max(512),password:z.string().min(1).max(1024)})}),
  z.object({action:z.literal('change-password'),input:z.object({userId:z.string(),currentPassword:z.string().min(1).max(1024),newPassword:z.string().min(1).max(1024)})}),
  z.object({action:z.literal('refresh')}),
  z.object({action:z.literal('logout')}),
]);

function source(request:NextRequest){return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';}
function setSession(response:NextResponse,token:string,rememberMe=true){const definition=cookieDefinition();response.cookies.set(definition.name,token,{httpOnly:definition.httpOnly,secure:definition.secure,sameSite:definition.sameSite,path:definition.path,...(rememberMe?{maxAge:definition.maxAge}:{})});}
function clearSession(response:NextResponse){const definition=cookieDefinition();response.cookies.set(definition.name,'',{httpOnly:true,secure:definition.secure,sameSite:'lax',path:'/',maxAge:0});}
function challengeSecret(){const value=process.env.BETTER_AUTH_SECRET;if(!value||value.length<32)throw new Error('BETTER_AUTH_SECRET is not configured');return value;}
function makeChallenge(userId:string){const payload=Buffer.from(JSON.stringify({userId,expiresAt:Date.now()+5*60_000})).toString('base64url');const signature=createHmac('sha256',challengeSecret()).update(payload).digest('base64url');return `${payload}.${signature}`;}
function readChallenge(request:NextRequest):string|null {const raw=request.cookies.get(challengeCookie())?.value;const [payload,signature]=raw?.split('.')??[];if(!payload||!signature)return null;const expected=createHmac('sha256',challengeSecret()).update(payload).digest();let supplied:Buffer;try{supplied=Buffer.from(signature,'base64url');}catch{return null;}if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return null;try{const parsed=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as {userId?:unknown;expiresAt?:unknown};return typeof parsed.userId==='string'&&typeof parsed.expiresAt==='number'&&parsed.expiresAt>Date.now()?parsed.userId:null;}catch{return null;}}
function setChallenge(response:NextResponse,userId:string){response.cookies.set(challengeCookie(),makeChallenge(userId),{httpOnly:true,secure:secure(),sameSite:'lax',path:'/',maxAge:5*60});}
function clearChallenge(response:NextResponse){response.cookies.set(challengeCookie(),'',{httpOnly:true,secure:secure(),sameSite:'lax',path:'/',maxAge:0});}

async function userResult(userId:string,expiresAt:string):Promise<Result<SessionUser>> {
  const user=await loadSessionUser(db().pool,userId,expiresAt);
  return user ? {status:'success',data:user} : {status:'unauthenticated',code:'UNAUTHENTICATED',message:'This account cannot start a session.',reason:'no_session'};
}

export async function GET(request:NextRequest){
  const token=sessionToken(request); if(!token) return json({status:'success',data:null} as const);
  try { const auth=createAuthenticationService(db().pool); const session=await auth.validateSession(token); if(session.status!=='success'){const response=json({status:'success',data:null} as const);clearSession(response);return response;} return json(await userResult(session.data.userId,session.data.expiresAt)); }
  catch{return unavailable();}
}

export async function POST(request:NextRequest){
  const trusted=[request.nextUrl.origin];
  const configured=process.env.APP_BASE_URL; if(configured){try{trusted.push(new URL(configured).origin);}catch{/* startup health reports invalid configuration */}}
  if(!isTrustedMutation({method:request.method,origin:request.headers.get('origin'),referer:request.headers.get('referer'),secFetchSite:request.headers.get('sec-fetch-site')},trusted)) return json({status:'permission_denied',code:'FORBIDDEN',message:'The request origin is not allowed.'} as const,403);
  let parsed:z.infer<typeof bodySchema>;
  try{parsed=bodySchema.parse(await request.json());}catch{return json({status:'validation_failure',code:'VALIDATION_FAILED',message:'Check the submitted values.',fieldErrors:[{field:'request',code:'INVALID_REQUEST',message:'The authentication request is incomplete.',guidance:'Refresh the page and try again.'}],focusField:'request'} as const,400);}
  try{
    const auth=createAuthenticationService(db().pool); const origin=source(request);
    switch(parsed.action){
      case 'login': {
        const result=await auth.login(parsed.input.identifier,parsed.input.password,origin);
        if(result.status==='permission_denied') return json(result,403);
        if(result.status==='error') return json(result,429);
        if(result.status==='unauthenticated') {
          if(result.reason==='two_factor_required') {const response=json({status:'success',data:{requiresTwoFactor:true,user:null}} as const);setChallenge(response,result.pendingUserId);return response;}
          return json({status:'validation_failure',code:'VALIDATION_FAILED',message:'Sign-in failed.',fieldErrors:[{field:'password',code:'INVALID_CREDENTIALS',message:'That email or employee ID and password do not match.',guidance:'Check both fields and try again.'}],focusField:'password'} as const,401);
        }
        const sessionUser=await userResult(result.data.userId,result.data.expiresAt);
        if(sessionUser.status!=='success') return json(sessionUser,401);
        const response=json({status:'success',data:{requiresTwoFactor:false,user:sessionUser.data}} as const); setSession(response,result.data.token,parsed.input.rememberMe); return response;
      }
      case 'refresh': {
        const token=sessionToken(request); if(!token)return noSession(); const rotated=await auth.rotateSession(token,origin); if(rotated.status!=='success'){const response=noSession();clearSession(response);return response;}
        const validated=await auth.validateSession(rotated.data.token); if(validated.status!=='success')return noSession(); const result=await userResult(validated.data.userId,rotated.data.expiresAt); const response=json(result); if(result.status==='success')setSession(response,rotated.data.token); return response;
      }
      case 'logout': {const token=sessionToken(request);if(token)await auth.logout(token);const response=json({status:'success',data:undefined} as const);clearSession(response);return response;}
      case 'request-password-reset': {await auth.requestPasswordReset(parsed.input.email,origin);return json({status:'success',data:undefined} as const);}
      case 'reset-password': return json(await auth.resetPassword(parsed.input.identifier,parsed.input.token,parsed.input.password));
      case 'change-password': {
        const token=sessionToken(request);if(!token)return noSession();const current=await auth.validateSession(token);if(current.status!=='success')return noSession();
        const changed=await auth.changePassword(current.data.userId,parsed.input.currentPassword,parsed.input.newPassword,origin);if(changed.status!=='success')return json(changed,changed.status==='validation_failure'?400:401);
        const response=json({status:'success',data:undefined} as const);setSession(response,changed.data.token);return response;
      }
      case 'verify-two-factor': {
        const userId=readChallenge(request);if(!userId)return json({status:'unauthenticated',code:'UNAUTHENTICATED',message:'Your sign-in attempt has expired.',reason:'session_expired'} as const,401);
        const authStore=new MysqlAuthenticationStore(db().pool);const limited=await new AuthenticationRateLimiter(authStore).check(secretHash(userId),secretHash(origin),'two_factor');if(limited.status==='error')return json(limited,429);
        const twoFactor=createTwoFactorService(db().pool);const verified=/^\d{6}$/.test(parsed.input.code)?await twoFactor.verify(userId,parsed.input.code):await twoFactor.recover(userId,parsed.input.code);
        if(!verified)return json({status:'validation_failure',code:'VALIDATION_FAILED',message:'That code is not valid.',fieldErrors:[{field:'code',code:'INVALID_CODE',message:'That code is not valid or has expired.',guidance:'Check the current authenticator code or use an unused recovery code.'}],focusField:'code'} as const,400);
        await authStore.recordSecurityEvent({userId,eventType:'two_factor_verified',originHash:secretHash(origin),correlationId:randomUUID()});const issued=await auth.issueSession(userId,secretHash(origin),null);const user=await userResult(userId,issued.data.expiresAt);if(user.status!=='success')return json(user,401);const response=json(user);setSession(response,issued.data.token);clearChallenge(response);return response;
      }
      case 'resend-two-factor': return json({status:'success',data:{nextResendAvailableAt:new Date(Date.now()+30_000).toISOString()}} as const);
    }
  }catch{return unavailable();}
}
