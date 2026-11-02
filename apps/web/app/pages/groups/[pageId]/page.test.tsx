import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({enabled:true}));
vi.mock('@/features/groups/domain/availability',()=>({groupsEnabled:()=>state.enabled}));
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('NOT_FOUND');},redirect:()=>{throw Error('REDIRECT');}}));
vi.mock('@/features/groups/ui/group-detail',()=>({GroupDetailScreen:()=>null}));
import Page from './page';
const pageId='f1630000-0000-4000-8000-000000000001';
beforeEach(()=>{state.enabled=true;});
it('connects calendar tab and requested month to actual group screen',async()=>{
 const page=await Page({params:Promise.resolve({pageId}),searchParams:Promise.resolve({tab:'calendar',month:'2026-11',locale:'en'})});expect(page.props).toMatchObject({pageId,tab:'calendar',calendarMonth:'2026-11',locale:'en'});
});
it('keeps release gating and invalid group IDs inaccessible',async()=>{
 state.enabled=false;await expect(Page({params:Promise.resolve({pageId}),searchParams:Promise.resolve({tab:'calendar'})})).rejects.toThrow('NOT_FOUND');state.enabled=true;await expect(Page({params:Promise.resolve({pageId:'invalid'}),searchParams:Promise.resolve({tab:'calendar'})})).rejects.toThrow('NOT_FOUND');
});
