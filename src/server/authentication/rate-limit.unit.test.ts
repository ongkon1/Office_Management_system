import {describe,expect,it,vi} from 'vitest';
import {AuthenticationRateLimiter} from './rate-limit';

describe('per-account and per-origin sensitive endpoint limits',()=>{
  it.each(['login','reset','two_factor'] as const)('requires both scopes to allow %s',async(action)=>{
    const increment=vi.fn().mockResolvedValueOnce({allowed:true,retryAfterSeconds:0}).mockResolvedValueOnce({allowed:false,retryAfterSeconds:42});
    const result=await new AuthenticationRateLimiter({increment}).check('account-hash','origin-hash',action);
    expect(increment).toHaveBeenCalledTimes(2);expect(result).toMatchObject({status:'error',code:'RATE_LIMITED',retryAfterSeconds:42});
  });
});
