import {beforeEach,expect,it,vi} from 'vitest';
 it('adds the home guide banners to the discovery slides and passes no separate featured banners',async()=>{
 const group=[{id:'g',category:'group'},{id:'gg',category:'guide'}],home=[{id:'we',category:'announcement'},{id:'guide',category:'guide'},{id:'gg',category:'guide'}];
 list.mockImplementation(async(_l:string,p:string)=>p==='groups'?group:home);
 const result=await Page({searchParams:Promise.resolve({})});
 expect(result.props.banners).toEqual([...group,home[1]]);expect(result.props).not.toHaveProperty('featuredBanners');
});
const {list,enabled,today}=vi.hoisted(()=>({list:vi.fn(),enabled:vi.fn(()=>true),today:vi.fn(async()=>[] as unknown[])}));
vi.mock('@/server/groups/today-fanpage-instance',()=>({loadTodayFanpages:today}));
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
 expect(today).toHaveBeenCalledWith('en');
});
it('does not read banners when groups are disabled',async()=>{
 enabled.mockReturnValue(false);await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');expect(list).not.toHaveBeenCalled();
});
it('passes the fan pages of the day to the directory, and an empty list when there are none',async()=>{
 const item={slug:'elina',name:'엘리나'};today.mockResolvedValueOnce([item]);
 expect((await Page({searchParams:Promise.resolve({})})).props.todayFanpages).toEqual([item]);
 expect((await Page({searchParams:Promise.resolve({})})).props.todayFanpages).toEqual([]);
});
