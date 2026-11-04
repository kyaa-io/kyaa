import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {CreatorGroupCollection,CreatorGroupHeader,CreatorGroupActivities} from './creator-group-header';
import {GroupDetailScreen} from './group-detail';
import {GroupCollections} from './group-activities';
import {collectionPresentationCopy} from './collection-presentation-copy';
import {groupCalendarLabel} from './group-calendar-label';
import {groupsCopy} from './copy';
import type {PublishedCelebrity} from '@/server/content/content-domain';

const id='e9200000-0000-4000-8000-000000000001',second='e9200000-0000-4000-8000-000000000002';
const groupName='원문 $& {name} · Studio',title='Original  product title';
const group={page:{id,kind:'brand',celebrityId:id,slug:'studio',name:groupName,description:'Original group description',imageUrl:null,question:null,memberCount:0},membership:null,bookmarked:false};
const item={id,title,imageUrl:null,externalUrl:'https://shop.example/item?original=1#product',status:'active',revision:3};
const celebrity={slug:'studio',name:groupName,summary:'',image:{url:'/logo.png',alt:'',position:'center'},roles:['brand'],socialLinks:[]} as unknown as PublishedCelebrity;
vi.mock('next/navigation',()=>({usePathname:()=>'/studio',useSearchParams:()=>new URLSearchParams('activity=collection'),useRouter:()=>({push:vi.fn()})}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>({ready:true,authenticated:false,user:null,getAccessToken:async()=>null})}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:null,generation:0})}));
vi.mock('./group-shell',async importOriginal=>({...await importOriginal<typeof import('./group-shell')>(),GroupShell:({children}:{children:React.ReactNode})=><main>{children}</main>,GroupAvatar:()=>null}));
vi.mock('./group-presence',()=>({GroupPresence:()=>null}));
vi.mock('./group-page-menu',()=>({GroupPageMenu:()=>null,useCompactHeader:()=>false}));
vi.mock('./group-bookmark-action',()=>({GroupBookmarkAction:()=>null}));
vi.mock('./group-home-panels',()=>({GroupHomeInfo:()=>null,GroupBrandHomeEvent:()=>null}));
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.includes('/collections')?{items:[item],canManage:false,nextCursor:null}:url.endsWith('/activities')?{certificationHref:null,missions:[],events:[],raffles:[]}:group))));

it.each(APP_LOCALES)('binds stored page names and source description through both real callers in %s',async locale=>{
 const copy=collectionPresentationCopy(locale),heading=copy.heading.replace('{name}',()=>groupName);
 const creator=render(<><CreatorGroupHeader celebrity={celebrity} locale={locale} tab='collection'/><CreatorGroupCollection slug='studio' locale={locale}/></>);
 await screen.findByRole('heading',{name:heading});
 expect(screen.getByText(copy.description)).toBeInTheDocument();
 expect(screen.getByRole('link',{name:groupCalendarLabel[locale]})).toHaveAttribute('href',`/studio?locale=${locale}&tab=calendar`);
 expect((await screen.findByRole('heading',{name:'Original product title'})).textContent).toBe(title);
 expect(screen.getByRole('link',{name:copy.seller})).toHaveAttribute('href',item.externalUrl);
 const panel=creator.container.querySelector('[data-group-collections]')!;
 expect(within(panel as HTMLElement).getAllByRole('button')).toHaveLength(1);
 expect(panel.querySelector('header')?.textContent).not.toContain(group.page.description);
 expect(panel.textContent).not.toContain('포토카드·키링 컬렉션');
 creator.unmount();
 render(<GroupDetailScreen pageId={id} locale={locale} tab='collection'/>);
 await screen.findByRole('heading',{name:heading});
 expect(screen.getByText(copy.description)).toBeInTheDocument();
 expect(screen.getByRole('link',{name:groupCalendarLabel[locale]})).toHaveAttribute('href',`/pages/groups/${id}?locale=${locale}&tab=calendar`);
});

it('passes the stored name through the existing activities collection destination',async()=>{
 render(<CreatorGroupActivities slug='studio' locale='ko'/>);
 expect(await screen.findByRole('heading',{name:`${groupName}의 컬렉션`})).toBeInTheDocument();
});
it('supports old callers and explicit existing presentation overrides without inventing categories',async()=>{
 const {rerender}=render(<GroupCollections pageId={id} locale='ko'/>);
 await screen.findByRole('heading',{name:'Original product title'});
 expect(screen.getByRole('heading',{name:groupsCopy('ko').collection})).toBeInTheDocument();
 expect(screen.getAllByRole('button')).toHaveLength(1);
 rerender(<GroupCollections pageId={id} locale='ko' pageName={groupName} heading='Explicit heading' description='Explicit description'/>);
 expect(screen.getByRole('heading',{name:'Explicit heading'})).toBeInTheDocument();
 expect(screen.getByText('Explicit description')).toBeInTheDocument();
});
it('keeps legacy pagination, selected product status and seller URL intact',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json({items:url.includes('cursor=')?[{...item,id:second,title:'Sold product',status:'sold_out'}]:[item],canManage:false,nextCursor:url.includes('cursor=')?null:id})));
 render(<GroupCollections pageId={id} locale='ko' pageName={groupName}/>);
 fireEvent.click(await screen.findByRole('button',{name:'더 보기'}));
 fireEvent.click(await screen.findByRole('button',{name:'Sold product'}));
 expect(screen.queryByRole('link',{name:collectionPresentationCopy('ko').seller})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Original product title'}));
 expect(screen.getByRole('link',{name:collectionPresentationCopy('ko').seller})).toHaveAttribute('href',item.externalUrl);
});
it('retains page identity through an empty list and a failed-list retry',async()=>{
 let fail=true;
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/collections')?(fail?Response.json({error:{code:'UNAVAILABLE'}},{status:503}):Response.json({items:[],canManage:false,nextCursor:null})):Response.json(group)));
 render(<CreatorGroupCollection slug='studio' locale='ja'/>);
 await screen.findByRole('alert');
 expect(screen.getByRole('heading',{name:collectionPresentationCopy('ja').heading.replace('{name}',()=>groupName)})).toBeInTheDocument();
 fail=false;fireEvent.click(screen.getByRole('button',{name:groupsCopy('ja').retry}));
 await waitFor(()=>expect(screen.getByText(groupsCopy('ja').empty)).toBeInTheDocument());
 expect(screen.queryByRole('link',{name:collectionPresentationCopy('ja').seller})).toBeNull();
});
