import { describe,it,expect,vi,beforeEach } from "vitest";
import { render,screen,fireEvent } from "@testing-library/react";
import { GroupMembers } from "./group-members";
const resource=vi.hoisted(()=>({data:{items:[],nextCursor:null,ranking:null} as Record<string,unknown>,error:false,loading:false,authenticated:true,retry:vi.fn()}));
vi.mock("./use-group-resource",()=>({useGroupResource:vi.fn(()=>resource)}));
import { useGroupResource } from "./use-group-resource";
const page="e9700000-0000-4000-8000-000000000001",profile="e9700000-0000-4000-8000-000000000002";
beforeEach(()=>{resource.data={items:[],nextCursor:null,ranking:null};resource.error=false;resource.loading=false;resource.authenticated=true;vi.clearAllMocks();});
describe("members/friends/ranking interface",()=>{
 it("uses three unique controls and sends friend/search selection to scoped API",()=>{render(<GroupMembers pageId={page} locale="ko" member/>);fireEvent.click(screen.getByRole("button",{name:"내 친구"}));expect(screen.getByRole("button",{name:"내 친구"})).toHaveAttribute("aria-pressed","true");fireEvent.change(screen.getByRole("searchbox",{name:"회원 검색"}),{target:{value:"별빛"}});fireEvent.click(screen.getByRole("button",{name:"검색"}));expect(useGroupResource).toHaveBeenLastCalledWith(expect.stringContaining("mode=friends&search=%EB%B3%84%EB%B9%9B"),expect.any(Function));});
 it("links to existing public profile and displays real rank and points",()=>{resource.data={items:[{profileId:profile,nickname:"별빛",avatarUrl:null,role:"member",rank:17,points:120}],nextCursor:null,ranking:{available:true,reason:null,fanCount:100,asOf:"2026-11-01T00:00:00Z"}};render(<GroupMembers pageId={page} locale="ko" member/>);fireEvent.click(screen.getByRole("button",{name:"팬 랭킹"}));expect(screen.getByRole("link")).toHaveAttribute("href",`/my/friends?locale=ko&profileId=${profile}`);expect(screen.getByText("팬 점수 120")).toBeVisible();expect(screen.getByLabelText("팬 랭킹 17")).toBeVisible();});
 it("does not call private directory before joining",()=>{render(<GroupMembers pageId={page} locale="ko" member={false}/>);expect(useGroupResource).toHaveBeenCalledWith(null,expect.any(Function));expect(screen.getByText("가입 후 함께하는 회원을 만나보세요.")).toBeVisible();});
 it("exposes a retry action when the server is unavailable",()=>{resource.error=true;render(<GroupMembers pageId={page} locale="ko" member/>);fireEvent.click(screen.getByRole("button",{name:"다시 시도"}));expect(resource.retry).toHaveBeenCalledOnce();});
});
