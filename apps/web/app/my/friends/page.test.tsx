import type{ReactElement}from'react';
import{afterEach,expect,it,vi}from'vitest';
import Page from'./page';
afterEach(()=>vi.unstubAllEnvs());
it.each(['friends','incoming','outgoing']as const)('passes a valid friend filter %s into the actual social screen',async filter=>{vi.stubEnv('KYAA_GROUPS_ENABLED','true');const result=await Page({searchParams:Promise.resolve({locale:'ko',filter})})as ReactElement<{friendFilter:string}>;expect(result.props.friendFilter).toBe(filter);});
it.each([undefined,'invalid',['incoming','outgoing']])('defaults an invalid friend filter %s to friends',async filter=>{vi.stubEnv('KYAA_GROUPS_ENABLED','true');const result=await Page({searchParams:Promise.resolve({locale:'ko',filter})})as ReactElement<{friendFilter:string}>;expect(result.props.friendFilter).toBe('friends');});
it('retains the group release gate',async()=>{vi.stubEnv('KYAA_GROUPS_ENABLED','false');await expect(Page({searchParams:Promise.resolve({filter:'incoming'})})).rejects.toThrow();});
