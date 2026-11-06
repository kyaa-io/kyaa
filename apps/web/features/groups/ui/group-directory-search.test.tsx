import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupDirectory } from "./group-directory";
vi.mock('next/navigation',()=>import('../../../e2e/groups-local/navigation'));
const auth=vi.hoisted(()=>({ready:true,authenticated:false,user:null,getAccessToken:async()=>null}));
const session=vi.hoisted(()=>({ready:true,ownerId:null,generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><main>{children}</main>,GroupAvatar:()=>null}));
vi.mock('./discovery-carousel',()=>({DiscoveryCarousel:()=>null}));
const row=(id:string,name:string)=>({id,kind:'hobby' as const,celebrityId:null,slug:null,name,description:'',imageUrl:null,question:null,memberCount:1});
const all=[row('10000000-0000-4000-8000-000000000001','전체 모임 A'),row('10000000-0000-4000-8000-000000000002','한강 러닝')];
type Pending={url:string;resolve:(items:typeof all)=>void};
let calls:Pending[];
const listCalls=()=>calls.filter(call=>call.url.includes('type=all'));
const settle=async()=>{await act(async()=>{await vi.advanceTimersByTimeAsync(0);});};
beforeEach(()=>{
 vi.useFakeTimers();calls=[];history.replaceState(null,'','/pages/groups?type=all');
 vi.stubGlobal('fetch',vi.fn((url:string)=>new Promise<Response>(resolve=>{calls.push({url,resolve:items=>resolve(Response.json({items,nextCursor:null}))});})));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const searchBox=()=>screen.getByRole('textbox',{name:/검색/}) as HTMLInputElement;
const answer=async(index:number,items:typeof all)=>{await act(async()=>{calls[index].resolve(items);await vi.advanceTimersByTimeAsync(0);});};
const searchUrls=()=>calls.map(call=>call.url).filter(url=>url.includes('search='));

it('searches 300ms after typing stops, keeps focus, and writes the value to the address',async()=>{
 render(<GroupDirectory locale='ko'/>);await settle();
 searchBox().focus();fireEvent.change(searchBox(),{target:{value:'한'}});
 await act(async()=>{await vi.advanceTimersByTimeAsync(299);});expect(searchUrls()).toEqual([]);
 fireEvent.change(searchBox(),{target:{value:'한강'}});
 await act(async()=>{await vi.advanceTimersByTimeAsync(299);});expect(searchUrls()).toEqual([]);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(searchUrls()).toHaveLength(1);expect(searchUrls()[0]).toContain('search=%ED%95%9C%EA%B0%95');
 expect(new URLSearchParams(location.search).get('search')).toBe('한강');
 expect(document.activeElement).toBe(searchBox());
});

it('does not search while a composition is open and searches once it ends',async()=>{
 render(<GroupDirectory locale='ko'/>);await settle();
 fireEvent.compositionStart(searchBox());fireEvent.change(searchBox(),{target:{value:'ㅎ'}});fireEvent.change(searchBox(),{target:{value:'하'}});
 await act(async()=>{await vi.advanceTimersByTimeAsync(2000);});expect(searchUrls()).toEqual([]);
 fireEvent.change(searchBox(),{target:{value:'한'}});fireEvent.compositionEnd(searchBox());
 await act(async()=>{await vi.advanceTimersByTimeAsync(299);});expect(searchUrls()).toEqual([]);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(searchUrls()).toHaveLength(1);expect(searchUrls()[0]).toContain('search=%ED%95%9C');
});

it('ignores a late answer to an older search and keeps the previous list visible while loading',async()=>{
 render(<GroupDirectory locale='ko'/>);await settle();
 const first=calls.findIndex(call=>call.url.includes('type=all'));expect(first).toBeGreaterThanOrEqual(0);
 await answer(first,all);expect(screen.getByText('전체 모임 A')).toBeInTheDocument();
 fireEvent.change(searchBox(),{target:{value:'한'}});await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
 const older=calls.length-1;expect(calls[older].url).toContain('search=%ED%95%9C');
 expect(screen.getByText('전체 모임 A')).toBeInTheDocument();expect(screen.queryByRole('status',{name:'불러오는 중'})).toBeNull();
 fireEvent.change(searchBox(),{target:{value:'한강'}});await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
 const latest=calls.length-1;expect(calls[latest].url).toContain('search=%ED%95%9C%EA%B0%95');
 await answer(latest,[all[1]]);expect(screen.getByText('한강 러닝')).toBeInTheDocument();expect(screen.queryByText('전체 모임 A')).toBeNull();
 await answer(older,[row('10000000-0000-4000-8000-000000000009','늦게 온 한 결과')]);
 expect(screen.getByText('한강 러닝')).toBeInTheDocument();expect(screen.queryByText('늦게 온 한 결과')).toBeNull();
});

it('runs Enter immediately, keeps a typed trailing space, and clearing returns to the full list',async()=>{
 render(<GroupDirectory locale='ko'/>);await settle();
 fireEvent.change(searchBox(),{target:{value:'한강'}});fireEvent.submit(searchBox().closest('form')!);await settle();
 expect(searchUrls()).toHaveLength(1);
 fireEvent.change(searchBox(),{target:{value:'한강 '}});await act(async()=>{await vi.advanceTimersByTimeAsync(400);});
 expect(searchBox().value).toBe('한강 ');expect(searchUrls()).toHaveLength(1);
 fireEvent.change(searchBox(),{target:{value:''}});await act(async()=>{await vi.advanceTimersByTimeAsync(300);});
 expect(new URLSearchParams(location.search).get('search')).toBeNull();
 // 전체 목록은 30초 안에 읽은 값을 다시 쓰므로 검색 호출이 더 늘지 않는다.
 expect(searchUrls()).toHaveLength(1);expect(listCalls().some(call=>call.url.includes('type=all')&&!call.url.includes('search='))).toBe(true);
});
