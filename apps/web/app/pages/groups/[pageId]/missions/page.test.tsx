import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({enabled:true}));
vi.mock('@/features/groups/domain/availability',()=>({groupsEnabled:()=>state.enabled}));
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('NOT_FOUND');}}));
vi.mock('@/features/groups/ui/group-mission-screen',()=>({GroupMissionsOverview:()=>null}));
import Page from './page';
const pageId='f1630000-0000-4000-8000-000000000001';
beforeEach(()=>{state.enabled=true;});
it('connects the existing mission overview destination with locale and group',async()=>{
 const page=await Page({params:Promise.resolve({pageId}),searchParams:Promise.resolve({locale:'en'})});
 expect(page.props).toEqual({pageId,locale:'en'});
});
it('keeps release gating and invalid group IDs inaccessible',async()=>{
 state.enabled=false;
 await expect(Page({params:Promise.resolve({pageId}),searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');
 state.enabled=true;
 await expect(Page({params:Promise.resolve({pageId:'invalid'}),searchParams:Promise.resolve({})})).rejects.toThrow('NOT_FOUND');
});
