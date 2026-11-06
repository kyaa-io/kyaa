import {describe,expect,it,vi} from 'vitest';
const redirect=vi.hoisted(()=>vi.fn((to:string)=>{throw new Error(`REDIRECT:${to}`);}));
vi.mock('next/navigation',()=>({redirect}));
import Page from './page';
const go=async(query:{locale?:string;name?:string})=>{await expect(Page({searchParams:Promise.resolve(query)})).rejects.toThrow('REDIRECT');return new URL(redirect.mock.lastCall![0],'https://kyaa.test');};
describe('favorite request path',()=>{
 it('sends the visitor to the one fan page application',async()=>{const url=await go({locale:'en',name:'아이유'});expect(url.pathname).toBe('/pages/groups/apply');expect(Object.fromEntries(url.searchParams)).toEqual({kind:'fan',locale:'en',name:'아이유'});});
 it('leaves out an empty name and an unknown language',async()=>{const url=await go({locale:'zz',name:'   '});expect(url.searchParams.get('locale')).toBe('ko');expect(url.searchParams.has('name')).toBe(false);});
 it('caps a long name',async()=>{const url=await go({name:'가'.repeat(300)});expect(url.searchParams.get('name')).toHaveLength(100);});
});
