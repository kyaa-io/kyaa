import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {createGroupHandler} from '@/server/groups/routes';
import {groupInviteShortLink,groupReferralLink,groupReferralPath,groupReferralGroupsPath,inviteShortDestination,referralCode,referralDestination} from './group-referral-link';
it('normalizes valid codes and rejects malformed input',()=>{expect(referralCode('abc-123')).toBe('ABC-123');for(const value of['short','a b c d','x'.repeat(33),null])expect(referralCode(value)).toBeUndefined();expect(()=>groupReferralPath('ko','wrong')).toThrow();});
it('keeps codes on an internal invitation route without introducing a friend QR token or external return',()=>{const link=new URL(groupReferralLink('https://dev.kyaa.io','ko','ABC123','/nchive?locale=ja#posts'));expect(link.origin).toBe('https://dev.kyaa.io');expect(link.pathname).toBe('/my/invitations');expect(link.searchParams.get('destination')).toBe('/nchive?locale=ja#posts');expect(link.searchParams.has('friend')).toBe(false);for(const value of['https://evil.test','//evil.test/path','/api/me/wallet','javascript:alert(1)'])expect(referralDestination(value)).toBe('/');});

it('passes the real directory strict query contract for joined destinations and its next cursor',async()=>{const actor='10000000-0000-4000-8000-000000000001',cursor='10000000-0000-4000-8000-000000000002',rpc=vi.fn(async()=>({items:[],nextCursor:null})),api=createGroupHandler({rpc,authorize:async()=>({appUserId:actor}),authorizeAdmin:async()=>({appUserId:actor,allowlistId:actor,role:'viewer',email:'viewer@example.test'})});for(const next of[undefined,cursor]){const path=groupReferralGroupsPath(next),url=new URL(path,'https://kyaa.test');expect(url.searchParams.get('mine')).toBe('joined');expect(url.searchParams.get('limit')).toBe('50');expect((await api('directory',new Request(url,{headers:{authorization:'Bearer valid'}}))).status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('groups_dispatch',expect.objectContaining({p_actor:actor,p_input:expect.objectContaining({mine:'joined',limit:50,...(next?{cursor:next}:{})})}));}});
// 261107-2 E3
it('keeps only the page path for the short invite address and builds kyaa.io/i/<7 letters>',()=>{
 expect(inviteShortDestination('/nchive?locale=ko')).toBe('/nchive');
 expect(inviteShortDestination('/pages/groups/10000000-0000-4000-8000-000000000001?locale=en')).toBe('/pages/groups/10000000-0000-4000-8000-000000000001');
 expect(inviteShortDestination('https://evil.example/x')).toBe('/');
 expect(groupInviteShortLink('https://kyaa.io','ab2cdef')).toBe('https://kyaa.io/i/ab2cdef');
 expect(()=>groupInviteShortLink('https://kyaa.io','../evil')).toThrow();
});
