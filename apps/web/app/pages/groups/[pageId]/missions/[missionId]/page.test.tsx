import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NOT_FOUND');}}));
vi.mock('@/features/groups/ui/group-mission-screen',()=>({GroupMissionScreen:()=>null}));
import Page from './page';
const params={pageId:'10000000-0000-4000-8000-000000000001',missionId:'10000000-0000-4000-8000-000000000002'};
beforeEach(()=>vi.stubEnv('KYAA_GROUPS_ENABLED','true'));afterEach(()=>vi.unstubAllEnvs());
it.each([undefined,'unknown','conditions'])('defaults %s to the requirements view',async(view)=>{const page=await Page({params:Promise.resolve(params),searchParams:Promise.resolve({locale:'en',view})});expect(page.props).toMatchObject({...params,locale:'en',view:'conditions'});});
it('passes an explicit submission view through the actual Next route',async()=>{const page=await Page({params:Promise.resolve(params),searchParams:Promise.resolve({locale:'ko',view:'submission'})});expect(page.props.view).toBe('submission');});
it('retains release and invalid-id guards',async()=>{vi.stubEnv('KYAA_GROUPS_ENABLED','false');await expect(Page({params:Promise.resolve(params),searchParams:Promise.resolve({view:'submission'})})).rejects.toThrow('NOT_FOUND');vi.stubEnv('KYAA_GROUPS_ENABLED','true');await expect(Page({params:Promise.resolve({...params,missionId:'bad'}),searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');});
