import {beforeEach,expect,it,vi} from 'vitest';
const {list,enabled}=vi.hoisted(()=>({list:vi.fn(),enabled:vi.fn(()=>true)}));
vi.mock('@/features/groups/domain/availability',()=>({groupsEnabled:enabled}));
vi.mock('@/server/content/home-banner-repository',()=>({createHomeBannerRepository:()=>({list})}));
vi.mock('@/server/config/env',()=>({loadServerEnv:()=>({})}));
vi.mock('@/features/groups/ui/group-directory',()=>({GroupDirectory:()=>null}));
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NOT_FOUND');}}));
import Page from './page';
beforeEach(()=>{list.mockReset().mockResolvedValue([]);enabled.mockReturnValue(true);});
it('loads only managed discovery banners and passes them to the real directory',async()=>{
 const banners=[{id:'managed-banner'}];list.mockResolvedValue(banners);
 const result=await Page({searchParams:Promise.resolve({locale:'ja',type:'all'})});
 expect(list).toHaveBeenCalledWith('en','groups');expect(result.props).toMatchObject({locale:'ja',banners});
});
it('does not read banners when groups are disabled',async()=>{
 enabled.mockReturnValue(false);await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');expect(list).not.toHaveBeenCalled();
});
