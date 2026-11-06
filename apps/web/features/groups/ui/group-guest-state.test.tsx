import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {clearResources} from "@/components/fan-ui/resource-cache";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupRaffleScreen } from "@/features/group-raffle/raffle-screen";
import { GroupRoomsPanel } from "./group-detail";
import { GroupDirectory } from "./group-directory";
import { GroupEarningsScreen } from "./group-earnings-screen";
import { GroupMembers } from "./group-members";
import { GroupMissionsOverview } from "./group-mission-screen";
vi.mock("next/navigation",()=>import("../../../e2e/groups-local/navigation"));
const auth=vi.hoisted(()=>({ready:true,authenticated:false,user:null,getAccessToken:vi.fn(async()=>null)}));
const session=vi.hoisted(()=>({ready:true,ownerId:null,generation:0}));
vi.mock("@/features/auth/client/cognito-auth",()=>({useByUsAuth:()=>auth}));
vi.mock("@/components/byus-session-provider",()=>({useByUsSession:()=>session}));
vi.mock("./group-shell",()=>({GroupShell:({children}:{children:React.ReactNode})=><main>{children}</main>,GroupAvatar:()=>null}));
vi.mock("./group-activity-header",()=>({GroupActivityHeader:()=>null}));
vi.mock("@/features/groups/ui/group-activity-frame",()=>({GroupActivityFrame:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock("@/features/dukjil/ui/dukjil-provider",()=>({DukjilProvider:({children}:{children:React.ReactNode})=><>{children}</>,useDukjilStatus:()=>"off",useDukjil:()=>null}));
const pageId="10000000-0000-4000-8000-000000000001",raffleId="10000000-0000-4000-8000-000000000002";
const urls:string[]=[];
let routes:Record<string,unknown>={};
function stub(){vi.stubGlobal("fetch",vi.fn(async(input:string)=>{const url=String(input);urls.push(url);const hit=Object.entries(routes).find(([key])=>url.includes(key));if(!hit)return Response.json({items:[],nextCursor:null});if(typeof hit[1]==="number")return Response.json({error:{code:"X"}},{status:hit[1]});return Response.json(hit[1]);}));}
beforeEach(()=>{auth.authenticated=false;urls.length=0;routes={};stub();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const privateCalls=()=>urls.filter(url=>/\/api\/me\/|\/people\b|\/rooms(\?|$)|\/members\b|\/earnings/.test(url));
const returnTo=(link:HTMLElement)=>new URL(link.getAttribute("href")!,"https://kyaa.invalid").searchParams.get("returnTo");

it("audit 7: lists public fans without calling the member APIs, and rows expose no profile action",async()=>{
 routes={"/public-people":{items:[{nickname:"공개 팬",avatarUrl:"/images/avatars/star-pink.webp",tier:"Silver"},{nickname:"둘째 팬",avatarUrl:null,tier:null}],nextOffset:null}};
 render(<GroupMembers pageId={pageId} locale="ko" member={false} rankingsSlug="elina" inTab presentation={{creatorName:"엘리나",subtitles:{}}}/>);
 expect(await screen.findByText("공개 팬")).toBeVisible();expect(screen.getByText("Silver")).toBeVisible();
 expect(privateCalls()).toEqual([]);
 expect(screen.queryByRole("link",{name:/공개 팬/})).toBeNull();expect(screen.queryByText("프로필 보기")).toBeNull();expect(screen.queryByRole("button",{name:/DM/})).toBeNull();
});
it("audit 7: pages through the public list by offset",async()=>{
 routes={"offset=30":{items:[{nickname:"뒷장 팬",avatarUrl:null,tier:null}],nextOffset:null},"/public-people":{items:[{nickname:"첫 팬",avatarUrl:null,tier:null}],nextOffset:30}};
 render(<GroupMembers pageId={pageId} locale="ko" member={false}/>);
 fireEvent.click(await screen.findByRole("button",{name:/더 보기/}));
 expect(await screen.findByText("뒷장 팬")).toBeVisible();expect(screen.getByText("첫 팬")).toBeVisible();
 expect(screen.queryByRole("button",{name:/더 보기/})).toBeNull();
});
it("audit 7: an empty or failing public list keeps the section and never turns into a private call",async()=>{
 routes={"/public-people":{items:[],nextOffset:null}};
 const view=render(<GroupMembers pageId={pageId} locale="ko" member={false}/>);
 expect(await screen.findByText("가입 후 함께하는 팬을 만나보세요.")).toBeVisible();view.unmount();clearResources();
 routes={"/public-people":503};
 render(<GroupMembers pageId={pageId} locale="ko" member={false}/>);
 expect(await screen.findByRole("alert")).toBeVisible();expect(screen.getByRole("button",{name:"다시 시도"})).toBeVisible();expect(privateCalls()).toEqual([]);
});
it("audit 7: the friends tab alone is locked and returns to the members tab after login",async()=>{
 render(<GroupMembers pageId={pageId} locale="en" member={false} rankingsSlug="elina"/>);
 fireEvent.click(screen.getByRole("button",{name:"My friends"}));
 expect(returnTo(await screen.findByRole("link",{name:"Log in"}))).toBe("/elina?locale=en&tab=members");
 expect(privateCalls()).toEqual([]);
});
it("audit 7: the ranking tab reads the filtered public ranking, never the unfiltered page ranking",async()=>{
 routes={"/public-ranking":{computedAt:"2026-11-06T00:00:00Z",rows:[{rank:3,score:9,nickname:"랭킹 팬",characterId:"star-pink"}]},"/jjinfan-challenge":{count:3,target:100}};
 render(<GroupMembers pageId={pageId} locale="ko" member={false} rankingsSlug="elina"/>);
 fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));
 expect(await screen.findByText("랭킹 팬")).toBeVisible();
 expect(urls.some(url=>url.includes(`/api/groups/${pageId}/public-ranking`))).toBe(true);expect(urls.some(url=>url.includes("/api/pages/elina/rankings"))).toBe(false);expect(privateCalls()).toEqual([]);
});
it("audit 8: shows room names, count and entry tier from the public read only; rows lead to login",async()=>{
 routes={"/public-rooms":{roomCount:2,items:[{name:"인증팬 소통방",minimumTier:"Bronze"},{name:"자유 소통방",minimumTier:null}]}};
 render(<GroupRoomsPanel pageId={pageId} locale="ko" slug="elina"/>);
 const link=await screen.findByRole("link",{name:/인증팬 소통방/});
 expect(within(link).getByText("Bronze 이상")).toBeVisible();expect(returnTo(link)).toBe("/elina?locale=ko&tab=rooms");
 expect(screen.getByRole("heading",{level:2})).toHaveTextContent("2");
 expect(privateCalls()).toEqual([]);
});
it("audit 8: a failed or empty public read keeps the login action",async()=>{
 routes={"/public-rooms":503};
 const view=render(<GroupRoomsPanel pageId={pageId} locale="ko"/>);
 expect(await screen.findByRole("button",{name:"다시 시도"})).toBeVisible();expect(screen.getByRole("link",{name:"로그인"})).toBeVisible();view.unmount();
 routes={"/public-rooms":{roomCount:0,items:[]}};
 render(<GroupRoomsPanel pageId={pageId} locale="ko"/>);
 await waitFor(()=>expect(urls.filter(url=>url.includes("/public-rooms")).length).toBe(2));
 expect(screen.getByRole("link",{name:"로그인"})).toBeVisible();
});
it("audit 8: a signed-in non-member sees the same names and a join action",async()=>{
 auth.authenticated=true;auth.getAccessToken.mockResolvedValue("token" as never);
 routes={"/public-rooms":{roomCount:1,items:[{name:"자유 소통방",minimumTier:null}]},"/rooms":403};
 render(<GroupRoomsPanel pageId={pageId} locale="ko" slug="elina"/>);
 expect(await screen.findByText("자유 소통방")).toBeVisible();
 expect(screen.getByRole("link",{name:"가입하기"})).toBeVisible();expect(screen.queryByRole("link",{name:"로그인"})).toBeNull();
});
it("audit 5: my pages holds locked rows, attendance is not a second emphasis, login links keep locale",async()=>{
 render(<GroupDirectory locale="en"/>);
 const links=await screen.findAllByRole("link",{name:"Log in"});
 expect(links[0].getAttribute("href")).toContain("locale=en");expect(returnTo(links[0])).toContain("/pages/groups?");
 const attendance=screen.getByRole("link",{name:/attendance|check.?in/i});
 expect(attendance.getAttribute("href")).toContain("/login?");expect(attendance.className).not.toMatch(/primary/);
 expect(privateCalls()).toEqual([]);
});
it("audit 9: my history is locked rather than an empty state, and no wallet call happens",async()=>{
 routes={"/missions":{missions:[],nextCursor:null}};
 render(<GroupMissionsOverview pageId={pageId} locale="ko"/>);
 const login=await screen.findByRole("link",{name:"로그인"});
 expect(returnTo(login)).toBe(`/pages/groups/${pageId}/missions?locale=ko`);
 expect(screen.getAllByRole("img",{name:"로그인 후 확인"}).length).toBe(1);
 const history=screen.getByRole("heading",{name:"내 참여 내역"}).parentElement!;
 expect(within(history).queryByText(/없어요/)).toBeNull();
 expect(screen.getByRole("link",{name:/출석체크/}).getAttribute("href")).toContain("/login?");
 expect(privateCalls()).toEqual([]);
});
it("audit 10: earnings shows locked rows with one login",async()=>{
 const view=render(<GroupEarningsScreen pageId={pageId} locale="ko"/>);
 expect(screen.getByRole("link",{name:"로그인"})).toBeVisible();expect(view.container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(1);
 expect(privateCalls()).toEqual([]);
});
it("audit 11: raffle shows public title and deadline, my entry stays locked, and no detail call happens",async()=>{
 routes={"/api/groups/benefits":{kind:"raffles",nextCursor:null,items:[{id:raffleId,pageId,pageName:"엘리나",title:"한강 러닝 굿즈",description:"굿즈 추첨",imageUrl:null,status:"open",closesAt:"2100-12-31T00:00:00Z",href:`/pages/groups/${pageId}/raffles/${raffleId}`}]}};
 render(<GroupRaffleScreen pageId={pageId} raffleId={raffleId} locale="ko"/>);
 expect(await screen.findByRole("heading",{name:"한강 러닝 굿즈"})).toBeVisible();
 expect(screen.getByText("응모 마감")).toBeVisible();expect(screen.getByRole("img",{name:"로그인 후 확인"})).toBeVisible();
 expect(returnTo(screen.getByRole("link",{name:"로그인"}))).toBe(`/pages/groups/${pageId}/raffles/${raffleId}?locale=ko`);
 expect(urls.some(url=>url.includes(`/raffles/${raffleId}`))).toBe(false);expect(privateCalls()).toEqual([]);
});
it("audit 11: a raffle the public list does not hold invents nothing, and a failure keeps the login",async()=>{
 routes={"/api/groups/benefits":{kind:"raffles",nextCursor:null,items:[]}};
 const view=render(<GroupRaffleScreen pageId={pageId} raffleId={raffleId} locale="ko"/>);
 expect(await screen.findByRole("heading",{name:"추첨 이벤트"})).toBeVisible();expect(screen.queryByText("응모 마감")).toBeNull();view.unmount();clearResources();
 routes={"/api/groups/benefits":503};
 render(<GroupRaffleScreen pageId={pageId} raffleId={raffleId} locale="ko"/>);
 expect(await screen.findByRole("alert")).toBeVisible();expect(screen.getByRole("link",{name:"로그인"})).toBeVisible();
});
