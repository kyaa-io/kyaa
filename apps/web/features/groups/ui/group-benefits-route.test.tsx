import {expect,it,vi,afterEach} from 'vitest';
import BenefitsPage from '@/app/benefits/page';
vi.mock('@/features/benefit/ui/benefit-screen',()=>({BenefitsScreen:()=>null}));
vi.mock('@/server/my/server-selected-bias',()=>({loadServerSelectedBias:async()=>null}));
vi.mock('next/headers',()=>({cookies:async()=>({has:()=>false})}));
afterEach(()=>vi.unstubAllEnvs());
it('selects the actual group benefits screen under the release gate',async()=>{
 vi.stubEnv('KYAA_GROUPS_ENABLED','true');
 const result=await BenefitsPage({searchParams:Promise.resolve({locale:'ja'})});
 expect(result.type.name).toBe('GroupBenefitsScreen');
 expect(result.props.locale).toBe('ja');
 // No session cookie: the guest-only parts are drawn in the first HTML, and no favorite was read on the server.
 expect(result.props.signedOut).toBe(true);
 expect(result.props.initialHeart).toBeNull();
});
it('retains the legacy screen and validated creator filter with the gate off',async()=>{
 vi.stubEnv('KYAA_GROUPS_ENABLED','false');
 const result=await BenefitsPage({searchParams:Promise.resolve({locale:'ko',celebrity:'nchive'})});
 expect(result.type.name).toBe('BenefitsScreen');
 expect(result.props.initialCelebrity).toBe('nchive');
});
