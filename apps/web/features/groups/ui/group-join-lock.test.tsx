import { describe,it,expect,vi,beforeEach } from "vitest";
import { render,screen,fireEvent } from "@testing-library/react";
const resource=vi.hoisted(()=>({data:null as unknown,error:false,loading:false,authenticated:true,retry:vi.fn()}));
vi.mock("./use-group-resource",()=>({useGroupResource:vi.fn(()=>resource)}));
vi.mock("@/features/group-social/member-dm-entry",()=>({MemberDmEntry:()=>null}));
import { GroupMembers } from "./group-members";
const page="e9700000-0000-4000-8000-000000000001";
beforeEach(()=>{resource.authenticated=true;vi.clearAllMocks();});
describe("members tab join lock",()=>{
 it("joins through the parent callback and stays on the tab",()=>{
  const onJoin=vi.fn();
  render(<GroupMembers pageId={page} locale="ko" member={false} onJoin={onJoin} joinLabel="가입하기"/>);
  const button=screen.getByRole("button",{name:"가입하기"});
  fireEvent.click(button);
  expect(onJoin).toHaveBeenCalledOnce();
  expect(screen.queryByRole("link",{name:"가입하기"})).toBeNull();
 });
 it("blocks duplicate submits while the join is pending",()=>{
  const onJoin=vi.fn();
  render(<GroupMembers pageId={page} locale="ko" member={false} onJoin={onJoin} joinPending joinLabel="가입하기"/>);
  const button=screen.getByRole("button",{name:"가입하기"});
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(onJoin).not.toHaveBeenCalled();
 });
 it("sends a logged-out viewer to login that returns to the members tab",()=>{
  resource.authenticated=false;
  render(<GroupMembers pageId={page} locale="ko" member={false} onJoin={vi.fn()} joinLabel="가입하기"/>);
  expect(screen.queryByRole("button",{name:"가입하기"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"내 친구"}));
  const link=screen.getByRole("link",{name:"로그인"});
  expect(link.getAttribute("href")).toContain("locale=ko");
  expect(link.getAttribute("href")).toContain(encodeURIComponent(`/pages/groups/${page}?tab=members`));
 });
});
