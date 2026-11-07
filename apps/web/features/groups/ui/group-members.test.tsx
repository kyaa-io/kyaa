vi.mock("@/features/group-social/profile-modal",()=>({ProfileModal:({person,onClose}:{person:{profileId:string;nickname:string;tier?:string|null};onClose:()=>void})=><div role="dialog" aria-label={person.nickname} data-profile={person.profileId} data-tier={person.tier??undefined}><button onClick={onClose}>닫기</button></div>}));
vi.mock("@/features/rankings/ui/use-ranking-resource",()=>({useRankingResource:vi.fn(()=>({state:ranked.state}))}));
const ranked=vi.hoisted(()=>({state:{status:"loading"} as Record<string,unknown>}));
import { describe,it,expect,vi,beforeEach } from "vitest";
import { render,screen,fireEvent } from "@testing-library/react";
import { GroupMembers } from "./group-members";
const resource=vi.hoisted(()=>({data:{items:[],nextCursor:null,ranking:null} as Record<string,unknown>,error:false,loading:false,authenticated:true,retry:vi.fn()}));
vi.mock("./use-group-resource",()=>({useGroupResource:vi.fn(()=>resource)}));
import { useGroupResource } from "./use-group-resource";
const page="e9700000-0000-4000-8000-000000000001",profile="e9700000-0000-4000-8000-000000000002";
beforeEach(()=>{ranked.state={status:"loading"};resource.data={items:[],nextCursor:null,ranking:null};resource.error=false;resource.loading=false;resource.authenticated=true;vi.clearAllMocks();});
describe("members/friends/ranking interface",()=>{
 it("uses three unique controls and sends friend/search selection to scoped API",()=>{resource.data={items:[{profileId:profile,nickname:"별빛",avatarUrl:null,role:"member",rank:null,points:null}],nextCursor:null,ranking:null};render(<GroupMembers pageId={page} locale="ko" member/>);fireEvent.click(screen.getByRole("button",{name:"내 친구"}));expect(screen.getByRole("button",{name:"내 친구"})).toHaveAttribute("aria-pressed","true");fireEvent.change(screen.getByRole("searchbox",{name:"팬 검색"}),{target:{value:"별빛"}});fireEvent.click(screen.getByRole("button",{name:"검색"}));expect(useGroupResource).toHaveBeenLastCalledWith(expect.stringContaining("mode=friends&search=%EB%B3%84%EB%B9%9B"),expect.any(Function));});
 it("opens the profile as a modal from a row and returns from it, and displays real rank and points",()=>{resource.data={items:[{profileId:profile,nickname:"별빛",avatarUrl:null,role:"member",rank:17,points:120}],nextCursor:null,ranking:{available:true,reason:null,fanCount:100,asOf:"2026-11-01T00:00:00Z"}};render(<GroupMembers pageId={page} locale="ko" member/>);fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));expect(screen.queryByRole("link",{name:/별빛/})).toBeNull();expect(screen.getByText("120 점")).toBeVisible();expect(screen.getByLabelText("팬 랭킹 17")).toBeVisible();fireEvent.click(screen.getByRole("button",{name:/별빛/}));expect(screen.getByRole("dialog",{name:"별빛"})).toHaveAttribute("data-profile",profile);fireEvent.click(screen.getByRole("button",{name:"닫기"}));expect(screen.queryByRole("dialog")).toBeNull();});
 it("does not call private directory before joining",()=>{render(<GroupMembers pageId={page} locale="ko" member={false}/>);expect(useGroupResource).toHaveBeenCalledWith(null,expect.any(Function));expect(screen.getByText("가입 후 함께하는 팬을 만나보세요.")).toBeVisible();});
 it("exposes a retry action when the server is unavailable",()=>{resource.error=true;render(<GroupMembers pageId={page} locale="ko" member/>);fireEvent.click(screen.getByRole("button",{name:"다시 시도"}));expect(resource.retry).toHaveBeenCalledOnce();});
});
it("presentation keeps real fans and scores, marks the selected row, and titles the ranking with the page name",()=>{resource.data={items:[{profileId:profile,nickname:"실제 팬",avatarUrl:null,role:"member",rank:17,points:120}],nextCursor:null,ranking:{available:true,reason:null,fanCount:100,asOf:"2026-11-01T00:00:00Z"}};render(<GroupMembers pageId={page} locale="ko" member presentation={{creatorName:"아티스트",overview:<p>공개된 모임 정보</p>,subtitles:{},selectedProfileId:profile}}/>);expect(screen.getByRole("button",{name:/실제 팬/})).toBeVisible();expect(screen.getByRole("listitem")).toHaveAttribute("data-selected","true");fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));expect(screen.getByRole("heading",{level:3,name:"아티스트 팬 랭킹"})).toBeVisible();expect(screen.getByText("120 점")).toBeVisible();expect(screen.getByText("팬 점수 기준 · 상위 100명")).toBeVisible();expect(screen.queryByText("내 순위 보기")).toBeNull();expect(screen.queryByText("상위 100명 전체 보기")).toBeNull();});
it('opens received requests with the actual incoming filter contract',()=>{resource.data={items:[],nextCursor:null};render(<GroupMembers pageId={page} locale='ko' member presentation={{creatorName:'아티스트',overview:null,subtitles:{}}}/>);expect(screen.getByRole('link',{name:'받은 친구 요청'})).toHaveAttribute('href','/my/friends?locale=ko&filter=incoming');});

it("shows the grade on a fan's row and keeps the role next to it for operators",()=>{resource.data={items:[{profileId:profile,nickname:"별빛",avatarUrl:null,role:"member",rank:null,points:null,tier:"Silver"},{profileId:page,nickname:"운영",avatarUrl:null,role:"manager",rank:null,points:null,tier:"Gold"}],nextCursor:null,ranking:null};render(<GroupMembers pageId={page} locale="ko" member/>);expect(screen.getByText("Silver")).toBeVisible();expect(screen.getByText("운영진 · Gold")).toBeVisible();});
it("falls back to the role when the server has no grade yet, or the page has none",()=>{resource.data={items:[{profileId:profile,nickname:"별빛",avatarUrl:null,role:"member",rank:null,points:null},{profileId:page,nickname:"운영",avatarUrl:null,role:"owner",rank:null,points:null,tier:null}],nextCursor:null,ranking:null};render(<GroupMembers pageId={page} locale="ko" member/>);const list=screen.getByRole("list");expect(list).toHaveTextContent("별빛팬");expect(list).toHaveTextContent("운영소유자");});
it("hands the row's grade to the modal so both say the same",()=>{resource.data={items:[{profileId:profile,nickname:"별빛",avatarUrl:null,role:"member",rank:null,points:null,tier:"Silver"}],nextCursor:null,ranking:null};render(<GroupMembers pageId={page} locale="ko" member/>);fireEvent.click(screen.getByRole("button",{name:/별빛/}));expect(screen.getByRole("dialog")).toHaveAttribute("data-tier","Silver");});
it("keeps the message action in the modal, not on the row",()=>{resource.data={items:[{profileId:profile,nickname:"별빛",avatarUrl:null,role:"member",rank:null,points:null}],nextCursor:null,ranking:null};render(<GroupMembers pageId={page} locale="ko" member/>);expect(screen.getAllByRole("button",{name:/별빛/})).toHaveLength(1);expect(screen.queryByRole("button",{name:/대화하기/})).toBeNull();expect(screen.queryByRole("link",{name:/별빛/})).toBeNull();});

it("keeps the section title for screen readers inside a tab and visible when it stands alone",()=>{
 const title=()=>screen.getByRole("heading",{level:2});
 const view=render(<GroupMembers pageId={page} locale="ko" member/>);
 expect(title().className).not.toMatch(/visuallyHidden/);
 view.unmount();
 render(<GroupMembers pageId={page} locale="ko" member inTab presentation={{creatorName:"아티스트",overview:null,subtitles:{}}}/>);
 expect(title().className).toMatch(/visuallyHidden/);
 fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));
 expect(title().className).toMatch(/visuallyHidden/);
});

it("does not offer a search over nothing: no friends shows one empty state and one way out",()=>{
 render(<GroupMembers pageId={page} locale="ko" member inTab presentation={{creatorName:"아티스트",subtitles:{}}}/>);
 fireEvent.click(screen.getByRole("button",{name:"내 친구"}));
 expect(screen.queryByRole("searchbox")).toBeNull();
 expect(screen.getByText("이 모임에 가입한 친구가 없어요.")).toBeVisible();
 expect(screen.getAllByRole("link",{name:/MY에서 친구 관리/})).toHaveLength(1);
});
it("keeps the list while the next search loads and shows the skeleton only the first time",()=>{
 resource.data={items:[{profileId:profile,nickname:"별빛",avatarUrl:null,role:"member",rank:null,points:null}],nextCursor:null,ranking:null};
 const view=render(<GroupMembers pageId={page} locale="ko" member/>);
 resource.data=undefined as never;resource.loading=true;view.rerender(<GroupMembers pageId={page} locale="ko" member/>);
 expect(screen.getByRole("button",{name:/별빛/})).toBeVisible();expect(screen.getByRole("list")).toHaveAttribute("aria-busy","true");
 view.unmount();
 const {container}=render(<GroupMembers pageId={page} locale="ko" member/>);
 expect(container.querySelector('[data-fan-skeleton="member"]')).toBeTruthy();
});
it("pins my rank under the list only when it is outside the top rows",()=>{
 resource.data={items:[{profileId:profile,nickname:"별빛",avatarUrl:null,role:"member",rank:1,points:900}],nextCursor:null,ranking:{available:true,reason:null,fanCount:120,asOf:"2026-11-01T00:00:00Z"}};
 ranked.state={status:"ready",data:{me:{rank:140,score:12,inTop:false}}};
 const view=render(<GroupMembers pageId={page} rankingsSlug="nchive" locale="ko" member inTab presentation={{creatorName:"아티스트",subtitles:{}}}/>);
 fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));
 expect(screen.getByText("내 순위")).toBeVisible();expect(screen.getByText("140")).toBeVisible();expect(screen.getByText("12 점")).toBeVisible();
 view.unmount();
 ranked.state={status:"ready",data:{me:{rank:1,score:900,inTop:true}}};
 render(<GroupMembers pageId={page} rankingsSlug="nchive" locale="ko" member inTab presentation={{creatorName:"아티스트",subtitles:{}}}/>);
 fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));
 expect(screen.queryByText("내 순위")).toBeNull();
});

it("shows no category chips that the ranking request cannot honour",()=>{
 resource.data={items:[],nextCursor:null,ranking:{available:true,reason:null,fanCount:100,asOf:"2026-11-01T00:00:00Z"}};
 render(<GroupMembers pageId={page} locale="ko" member inTab presentation={{creatorName:"아티스트",subtitles:{}}}/>);
 fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));
 for(const label of ["지식","LIVE","미션","팬인증"])expect(screen.queryByRole("button",{name:label})).not.toBeInTheDocument();
});
it("links the fan ranking tab to the public creator ranking only when a slug is given",()=>{
  const {unmount}=render(<GroupMembers pageId={page} rankingsSlug="nchive" locale="ko" member inTab presentation={{creatorName:"아티스트",subtitles:{}}}/>);
  fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));
  expect(screen.getByRole("link",{name:"팬 랭킹"})).toHaveAttribute("href","/rankings/nchive?locale=ko");
  unmount();
  render(<GroupMembers pageId={page} locale="ko" member inTab presentation={{creatorName:"아티스트",subtitles:{}}}/>);
  fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));
  expect(screen.queryByRole("link",{name:"팬 랭킹"})).not.toBeInTheDocument();
});
