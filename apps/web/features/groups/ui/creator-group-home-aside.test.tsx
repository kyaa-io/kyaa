import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CreatorGroupHomeAside} from './creator-group-home-aside';
import {feedbackSummary} from '../../../e2e/lounge-local/feedback-fixture';
const fixture=vi.hoisted(()=>({stamps:[] as {id:string;kind:string;celebritySlug:string|null;issuedAt:string}[]}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string|null)=>({data:url?.startsWith('/api/passports/')?{id:'10000000-0000-4000-8000-000000000001',stamps:[],activities:[],stampSummary:{total:0},firstReaction:null}:undefined,error:false})}));
vi.mock('@/features/community-stamps/ui/use-community-stamps',()=>({useCommunityStamps:()=>({state:{status:'ready',data:{stamps:fixture.stamps}}})}));
vi.mock('@/features/passport/ui/passport-identity-artwork',()=>({PassportIdentityArtwork:()=> <div role='img' aria-label='actual owned passport'/>}));
vi.mock('@/features/community-stamps/ui/community-stamp-artwork',()=>({CommunityStampArtwork:({kind}:{kind:string})=><span data-earned-kind={kind}/> }));
it('shows only actual issued passport and creator-scoped earned stamps in the desktop context',()=>{
 const owned=feedbackSummary('ko').creators[0];fixture.stamps=[{id:'welcome',kind:'welcome',celebritySlug:null,issuedAt:'2026-11-01T00:00:00Z'},{id:'other',kind:'first_comment',celebritySlug:'other',issuedAt:'2026-11-01T00:00:00Z'}];
 const view=render(<CreatorGroupHomeAside slug={owned.celebrity.slug} locale='ko' owned={owned} passportId={owned.passport.id}/>);expect(screen.getByRole('img',{name:'actual owned passport'})).toBeInTheDocument();expect(view.container.querySelector('[data-earned-kind=welcome]')).toBeInTheDocument();expect(view.container.querySelector('[data-earned-kind=first_comment]')).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'하트 보내기'})).toHaveAttribute('href',`/my/wallet?view=support&creator=${owned.celebrity.slug}&locale=ko`);
});
it('does not display an issued book for a visitor with no issued passport',()=>{render(<CreatorGroupHomeAside slug='elina' locale='ko'/>);expect(screen.queryByRole('img',{name:'actual owned passport'})).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'패스포트 열기'})).toHaveAttribute('href','/elina?locale=ko&tab=certifications');});
