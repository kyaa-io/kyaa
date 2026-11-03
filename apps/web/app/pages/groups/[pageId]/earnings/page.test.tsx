import {afterEach,expect,it,vi} from 'vitest';
import ListPage from './page';
import DetailPage from './[entryKey]/page';
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NOT_FOUND');}}));
vi.mock('@/features/groups/ui/group-earnings-screen',()=>({GroupEarningsScreen:()=>null}));
vi.mock('@/features/groups/ui/group-earning-result',()=>({GroupEarningResult:()=>null}));
const pageId='10000000-0000-4000-8000-000000000001',entryKey=`activity:${pageId}`;
afterEach(()=>vi.unstubAllEnvs());
it('keeps feature gating and literal UUID validation',async()=>{
 vi.stubEnv('KYAA_GROUPS_ENABLED','false');
 await expect(ListPage({params:Promise.resolve({pageId}),searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');
 vi.stubEnv('KYAA_GROUPS_ENABLED','true');
 await expect(ListPage({params:Promise.resolve({pageId:'not-a-uuid'}),searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');
});
it('passes parsed locale and opaque cursor to real Next entrypoints',async()=>{
 vi.stubEnv('KYAA_GROUPS_ENABLED','true');
 const input={params:Promise.resolve({pageId,entryKey}),searchParams:Promise.resolve({locale:'ja',cursor:'opaque+/='})};
 expect((await ListPage(input)).props).toMatchObject({pageId,locale:'ja',cursor:'opaque+/='});
 expect((await DetailPage(input)).props).toMatchObject({pageId,entryKey,locale:'ja',cursor:'opaque+/='});
});
it('rejects malformed detail keys and oversize cursor without repairing tokens',async()=>{
 vi.stubEnv('KYAA_GROUPS_ENABLED','true');
 await expect(DetailPage({params:Promise.resolve({pageId,entryKey:'activity:broken'}),searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');
 await expect(ListPage({params:Promise.resolve({pageId}),searchParams:Promise.resolve({cursor:'a'.repeat(2049)})})).rejects.toThrow('NOT_FOUND');
});
