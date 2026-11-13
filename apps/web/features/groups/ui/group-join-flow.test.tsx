vi.mock("../secret-room-config", () => ({ SECRET_ROOMS_ENABLED: true }));
import { describe,it,expect,vi,beforeEach,afterEach } from "vitest";
import { render,screen,fireEvent,waitFor,cleanup,within } from "@testing-library/react";
const res=vi.hoisted(()=>({detail:{data:null as unknown,error:false,loading:false,authenticated:true,retry:vi.fn(),request:vi.fn(),failure:undefined,ownerKey:"o"}}));
vi.mock("./use-group-resource",()=>({GroupRequestError:class extends Error{},useGroupRequest:()=>({request:vi.fn(()=>Promise.reject(new Error("no catalog"))),authenticated:true,ready:true,ownerKey:"o"}),useGroupResource:(url:string|null)=>url&&url.endsWith("/public-rooms")?{data:{roomCount:0,items:[]},error:false,loading:false,authenticated:true,retry:vi.fn()}:url&&url.endsWith("/rooms")?{data:null,error:true,loading:false,authenticated:true,retry:vi.fn(),failure:{status:403}}:res.detail}));
vi.mock("./use-linked-fanpage",()=>({useLinkedFanpage:()=>({data:null,error:false,retry:vi.fn()})}));
vi.mock("./group-page-menu",()=>({GroupPageMenu:()=>null,useCompactHeader:()=>false}));
vi.mock("./group-presence",()=>({GroupPresence:()=>null}));
vi.mock("./group-shell",async()=>({GroupShell:({children}:{children:React.ReactNode})=><div>{children}</div>,GroupIdentityHeader:({actions}:{actions:React.ReactNode})=><header>{actions}</header>}));
vi.mock("./group-board",()=>({GroupBoard:({onJoin,joinLabel}:{onJoin:()=>void;joinLabel?:string})=><button type="button" onClick={onJoin}>{`lock:${joinLabel}`}</button>}));
vi.mock("./group-home",()=>({GroupHome:()=>null,GroupSideRail:()=>null}));
vi.mock("./group-members",()=>({GroupMembers:({onJoin,joinLabel}:{onJoin:()=>void;joinLabel?:string})=><button type="button" onClick={onJoin}>{`members:${joinLabel}`}</button>}));
import { GroupDetailScreen } from "./group-detail";
const id="e9700000-0000-4000-8000-000000000001";
const detail=(question:string|null,kind="hobby")=>({page:{id,kind,name:"모임",slug:null,imageUrl:null,question,description:"d",memberCount:1,celebrityId:null},membership:null,bookmarked:false});
beforeEach(()=>{res.detail.request.mockReset().mockResolvedValue({});res.detail.retry.mockReset();Element.prototype.scrollIntoView=vi.fn();});
afterEach(cleanup);
const joinBody=()=>JSON.parse(res.detail.request.mock.calls[0][1].body);
describe("group join from locked panels",()=>{
 it("joins immediately without a question",async()=>{
  res.detail.data=detail(null);render(<GroupDetailScreen locale="ko" pageId={id} tab="board"/>);
  fireEvent.click(screen.getByRole("button",{name:/^lock:/}));
  await waitFor(()=>expect(res.detail.request).toHaveBeenCalledOnce());
  expect(res.detail.request.mock.calls[0][0]).toBe(`/api/groups/${id}/membership`);expect(joinBody().answer).toBe("");
 });
 it("opens the question form, focuses it and scrolls it into view",async()=>{
  res.detail.data=detail("왜 가입하나요?");render(<GroupDetailScreen locale="ko" pageId={id} tab="members"/>);
  fireEvent.click(screen.getByRole("button",{name:/^members:/}));
  const box=await screen.findByRole("textbox");
  await waitFor(()=>expect(document.activeElement).toBe(box));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();expect(res.detail.request).not.toHaveBeenCalled();
 });
 it("shows a retry after a failed join and resends the same answer",async()=>{
  res.detail.data=detail("왜 가입하나요?");res.detail.request.mockRejectedValueOnce(new Error("x"));
  render(<GroupDetailScreen locale="ko" pageId={id} tab="board"/>);
  fireEvent.click(screen.getByRole("button",{name:/^lock:/}));
  fireEvent.change(await screen.findByRole("textbox"),{target:{value:"좋아해서요"}});
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  const alert=await screen.findByRole("alert");const retry=within(alert).getByRole("button",{name:"다시 시도"});await waitFor(()=>expect(retry).toBeEnabled());fireEvent.click(retry);
  await waitFor(()=>expect(res.detail.request).toHaveBeenCalledTimes(2));
  expect(JSON.parse(res.detail.request.mock.calls[1][1].body).answer).toBe("좋아해서요");
  expect(JSON.parse(res.detail.request.mock.calls[1][1].body).requestId).toBe(JSON.parse(res.detail.request.mock.calls[0][1].body).requestId);
 });
 it("labels locked join buttons like the header on a brand page",()=>{
  res.detail.data=detail(null,"brand");render(<GroupDetailScreen locale="ko" pageId={id} tab="board"/>);
  expect(screen.getByRole("button",{name:"lock:브랜드 가입"})).toBeTruthy();
 });
 it("joins from the private room 403 panel",async()=>{
  res.detail.data=detail(null);render(<GroupDetailScreen locale="ko" pageId={id} tab="rooms"/>);
  // 비밀방 아래의 가입은 머리의 별과 같은 값(`g.star`)이라 라벨이 `가입`이다.
  const buttons=await screen.findAllByRole("button",{name:"가입"});
  expect(buttons.length).toBeGreaterThan(1);
  fireEvent.click(buttons[buttons.length-1]);
  await waitFor(()=>expect(res.detail.request).toHaveBeenCalledOnce());
 });
});
