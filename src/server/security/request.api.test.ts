import {describe,expect,it} from 'vitest';
import {isTrustedMutation,sessionCookie} from './request';

describe('first-party HTTP security boundary',()=>{
  it.each(['POST','PUT','PATCH','DELETE'])('rejects cross-origin %s mutations',(method)=>expect(isTrustedMutation({method,origin:'https://evil.test',referer:null,secFetchSite:'cross-site'},['https://office.test'])).toBe(false));
  it('accepts same-origin mutation and emits a host-only production cookie',()=>{
    expect(isTrustedMutation({method:'POST',origin:'https://office.test',referer:null,secFetchSite:'same-origin'},['https://office.test'])).toBe(true);
    expect(sessionCookie()).toMatchObject({name:'__Host-office_session',httpOnly:true,secure:true,sameSite:'lax',path:'/'});
  });
});
