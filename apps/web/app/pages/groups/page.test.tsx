import {beforeEach,expect,it,vi} from 'vitest';
 it('adds the home guide banners to the discovery slides and passes no separate featured banners',async()=>{
 const group=[{id:'g',category:'group'},{id:'gg',category:'guide'}],home=[{id:'we',category:'announcement'},{id:'guide',category:'guide'},{id:'gg',category:'guide'}];
 list.mockImplementation(async(_l:string,p:string)=>p==='groups'?group:home);
 const result=await Page({searchParams:Promise.resolve({})});
 expect(result.props.banners).toEqual([...group,home[1]]);expect(result.props).not.toHaveProperty('featuredBanners');
});
const {list,enabled,today,route}=vi.hoisted(()=>({list:vi.fn(),enabled:vi.fn(()=>true),today:vi.fn(async()=>[] as unknown[]),route:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/server/groups/dependencies',()=>({groupRoute:route}));
vi.mock('@/server/groups/today-fanpage-instance',()=>({loadTodayFanpages:today}));
vi.mock('@/features/groups/domain/availability',()=>({groupsEnabled:enabled}));
vi.mock('@/server/content/home-banner-repository',()=>({createHomeBannerRepository:()=>({list})}));
vi.mock('@/server/config/env',()=>({loadServerEnv:()=>({})}));
vi.mock('@/features/groups/ui/group-directory',()=>({GroupDirectory:()=>null}));
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NOT_FOUND');}}));
import Page from './page';
beforeEach(()=>{list.mockReset().mockResolvedValue([]);enabled.mockReturnValue(true);route.mockReset().mockResolvedValue(Response.json({error:{code:'GROUPS_UNAVAILABLE'}},{status:503}));});
it('loads only managed discovery banners and passes them to the real directory',async()=>{
 const banners=[{id:'managed-banner'}];list.mockResolvedValue(banners);
 const result=await Page({searchParams:Promise.resolve({locale:'ja',type:'all'})});
 expect(list).toHaveBeenCalledWith('en','groups');expect(result.props).toMatchObject({locale:'ja',banners});
 expect(today).toHaveBeenCalledWith('en');
});
it('does not read banners when groups are disabled',async()=>{
 enabled.mockReturnValue(false);await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');expect(list).not.toHaveBeenCalled();
});
it('passes only the slugs of this week\'s hot fan pages, in order, to order the promo banners',async()=>{
 today.mockResolvedValueOnce([{slug:'elina',name:'엘리나'},{slug:'wena',name:'위나'}]);
 expect((await Page({searchParams:Promise.resolve({})})).props.promoOrder).toEqual(['elina','wena']);
 expect((await Page({searchParams:Promise.resolve({})})).props.promoOrder).toEqual([]);
});
it('puts the first guest page of the unfiltered list in the server HTML, and leaves a filtered or failed list to the browser',async()=>{
 const page={id:'11111111-1111-4111-8111-111111111111',type:'fan',name:'엘리나'};
 route.mockImplementation(async()=>Response.json({items:[],nextCursor:null,totalCount:0}));
 const result=await Page({searchParams:Promise.resolve({locale:'ja'})});
 expect(route).toHaveBeenCalledTimes(1);
 const [operation,request]=route.mock.calls[0] as [string,Request];
 expect(operation).toBe('directory');expect(request.headers.has('authorization')).toBe(false);
 expect(new URL(request.url).search).toBe('?limit=20&type=all&sort=discovery&locale=en');
 expect(result.props.initialList).toEqual({items:[],nextCursor:null,totalCount:0});
 expect((await Page({searchParams:Promise.resolve({type:'fan'})})).props.initialList).toBeUndefined();
 expect(route).toHaveBeenCalledTimes(1);
 route.mockResolvedValue(Response.json({items:[page]}));
 expect((await Page({searchParams:Promise.resolve({})})).props.initialList).toBeUndefined();
});
