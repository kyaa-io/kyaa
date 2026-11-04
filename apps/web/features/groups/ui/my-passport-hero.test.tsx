import { render,screen } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import { MyPassportHero } from './my-passport-hero';
import type { MySummary } from '@/features/my/domain/my-summary';
import type { CommunityStamp } from '@/features/community-stamps/domain/community-stamps';
const request=vi.hoisted(()=>vi.fn());
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string|null)=>{request(url);return {data:undefined,loading:false,error:false};}}));
vi.mock('@/features/passport/ui/passport-identity-artwork',()=>({PassportIdentityArtwork:()=> <div data-testid='actual-passport-artwork'/>}));
vi.mock('@/features/community-stamps/ui/community-stamp-artwork',()=>({CommunityStampArtwork:({kind,decorative}:{kind:string;decorative?:boolean})=><span data-stamp-kind={kind} aria-hidden={decorative}/> }));
const id='10000000-0000-4000-8000-000000000001';
const creator={celebrity:{slug:'elina',name:'엘리나',image:'/elina.jpg',isPublic:true},relationship:'passport',passport:{id,tier:'Silver',score:10,remainingToNextTier:10},ticketBalance:1,firstReaction:null} as MySummary['creators'][number];
const stamp=(kind:CommunityStamp['kind'],slug:string|null):CommunityStamp=>({id,kind,celebritySlug:slug,issuedAt:'2026-11-02T00:00:00Z',mint:{status:'queued',txHash:null,tokenId:null}});
beforeEach(()=>request.mockClear());
it('preserves replacement-like characters in the stored creator name',()=>{
 const name="Studio $& $' $` {name}";
 render(<MyPassportHero creators={[{...creator,celebrity:{...creator.celebrity,name}}]} onSelect={()=>{}} communityStamps={[]} stampsLoading={false} locale='ko'/>);
 expect(screen.getByRole('heading',{name:name+' 팬 활동 기록'})).toBeVisible();
});
it('uses an issued passport and only actually earned, correctly scoped stamp records',()=>{
 const view=render(<MyPassportHero creators={[creator]} selectedSlug='elina' onSelect={()=>{}} communityStamps={[stamp('welcome',null),stamp('first_comment','elina'),stamp('daily_checkin','other')]} stampsLoading={false} locale='ko'/>);
 expect(screen.getByTestId('actual-passport-artwork')).toBeInTheDocument();expect(view.container.querySelector('[data-stamp-kind="welcome"]')).toBeInTheDocument();expect(view.container.querySelector('[data-stamp-kind="first_comment"]')).toBeInTheDocument();expect(view.container.querySelector('[data-stamp-kind="daily_checkin"]')).not.toBeInTheDocument();expect(request).toHaveBeenCalledWith('/api/passports/'+id+'?locale=ko&tierStages=1');
});
it('does not invent an owned passport or milestone stamps for an empty record set',()=>{
 const view=render(<MyPassportHero creators={[{...creator,passport:null,relationship:'first_reaction_only'}]} onSelect={()=>{}} communityStamps={[]} stampsLoading={false} locale='ko'/>);expect(screen.queryByTestId('actual-passport-artwork')).not.toBeInTheDocument();expect(view.container.querySelector('[data-stamp-kind]')).not.toBeInTheDocument();expect(request).toHaveBeenCalledWith(null);
});

it('clears the previous creator milestones when another issued passport is selected',()=>{
 const other={...creator,celebrity:{...creator.celebrity,slug:'jenny',name:'제니정'},passport:{...creator.passport!,id:'20000000-0000-4000-8000-000000000001'}};
 const props={creators:[creator,other,{...creator,celebrity:{...creator.celebrity,slug:'unissued',name:'미발급'},passport:null}],onSelect:()=>{},communityStamps:[stamp('welcome',null),stamp('first_comment','elina'),stamp('daily_checkin','elina')],stampsLoading:false,locale:'ko' as const};
 const view=render(<MyPassportHero {...props} selectedSlug='elina'/>);expect(view.container.querySelector('[data-stamp-kind="first_comment"]')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'미발급'})).not.toBeInTheDocument();view.rerender(<MyPassportHero {...props} selectedSlug='jenny'/>);expect(view.container.querySelector('[data-stamp-kind="welcome"]')).toBeInTheDocument();expect(view.container.querySelector('[data-stamp-kind="first_comment"]')).not.toBeInTheDocument();expect(view.container.querySelector('[data-stamp-kind="daily_checkin"]')).not.toBeInTheDocument();expect(screen.getByRole('heading',{name:'제니정 팬 활동 기록'})).toBeInTheDocument();
});
it('embedded mode drops the hero title and passport CTA but keeps the passport, record heading and detail link target',()=>{
 const view=render(<MyPassportHero embedded creators={[creator]} selectedSlug='elina' onSelect={()=>{}} communityStamps={[stamp('welcome',null)]} stampsLoading={false} locale='ko'/>);
 expect(screen.queryByRole('heading',{level:2})).not.toBeInTheDocument();
 expect(screen.getByRole('heading',{level:3,name:'엘리나 팬 활동 기록'})).toBeVisible();
 expect(screen.getByTestId('actual-passport-artwork')).toBeInTheDocument();
 expect(view.container.querySelector('a[data-my-passport-book="'+id+'"]')).toHaveAttribute('href','/passports/'+id+'?locale=ko');
 expect(view.container.firstElementChild?.className).toContain('embedded');
 expect(view.container.querySelectorAll('a[href^="/passports/"]')).toHaveLength(1);
});
it('default mode keeps the hero title and the passport CTA',()=>{
 render(<MyPassportHero creators={[creator]} selectedSlug='elina' onSelect={()=>{}} communityStamps={[]} stampsLoading={false} locale='ko'/>);
 expect(screen.getByRole('heading',{level:2})).toBeVisible();
 expect(screen.getAllByRole('link').filter(a=>a.getAttribute('href')?.startsWith('/passports/'))).toHaveLength(2);
});
