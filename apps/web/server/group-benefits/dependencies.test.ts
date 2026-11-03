import{afterEach,it,expect,vi}from'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({create:vi.fn(),rpc:vi.fn().mockResolvedValue({kind:'raffles',items:[],nextCursor:null}),authorize:vi.fn()}));
vi.mock('@/server/fanpage/dependencies',()=>({createFanpageDependencies:mocks.create}));
import{groupBenefitsRoute}from'./dependencies';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('keeps the catalog absent when group release is off',async()=>{vi.stubEnv('KYAA_GROUPS_ENABLED','false');expect((await groupBenefitsRoute(new Request('https://kyaa.test/api/groups/benefits?kind=raffles'))).status).toBe(404);expect(mocks.create).not.toHaveBeenCalled();});
it('connects enabled GET discovery to existing service dependencies',async()=>{vi.stubEnv('KYAA_GROUPS_ENABLED','true');mocks.create.mockReturnValue({rpc:mocks.rpc,authorize:mocks.authorize});expect((await groupBenefitsRoute(new Request('https://kyaa.test/api/groups/benefits?kind=raffles'))).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('read_group_benefits_catalog',{p_kind:'raffles',p_actor:null,p_cursor:null,p_limit:30});});
