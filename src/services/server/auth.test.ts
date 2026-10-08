import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverAuthService } from './auth';

describe('BE-0901 server authentication browser adapter',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('uses same-origin credentials and does not persist session data in browser storage',async()=>{
    const response={status:'success',data:null};
    const fetchMock=vi.fn().mockResolvedValue({json:vi.fn().mockResolvedValue(response)});
    vi.stubGlobal('fetch',fetchMock);
    await expect(serverAuthService.getSession()).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth',expect.objectContaining({credentials:'include',cache:'no-store'}));
  });

  it('maps transport failure to the shared dependency error shape',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
    await expect(serverAuthService.login({identifier:'a@b.test',password:'secret',rememberMe:false})).resolves.toEqual(expect.objectContaining({status:'error',code:'DEPENDENCY_FAILED'}));
  });
});
