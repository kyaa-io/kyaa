import {afterEach,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NOT_FOUND');}}));
vi.mock('@/components/admin/group-admin-overview',()=>({GroupAdminOverview:()=>null}));
import Page from './page';
afterEach(()=>vi.unstubAllEnvs());
it('keeps the new administrator route unavailable when groups are disabled',async()=>{
 vi.stubEnv('KYAA_GROUPS_ENABLED','false');
 await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');
});
it('passes the chosen language to the guarded administrator screen',async()=>{
 vi.stubEnv('KYAA_GROUPS_ENABLED','true');
 expect((await Page({searchParams:Promise.resolve({lang:'en'})})).props.locale).toBe('en');
});
