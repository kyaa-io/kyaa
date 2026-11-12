import { rememberQuizFocusReturn } from '@/features/quiz/domain/quiz-close-return';
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  user: { id: "did:privy:fan-one" },
  getAccessToken: vi.fn(async () => "token"),
}));
vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => auth }));
// 261107-2 D12: the share proof tile leads the list and its rows join the history; their own behaviour is tested in share-proof-panel.test.tsx.
vi.mock("@/features/share-proof/ui/share-proof-panel", () => ({
  ShareProofTile: () => <a href="?share=1" data-share-proof-tile="">share proof</a>,
  ShareProofHistoryRows: ({ empty }: { empty: import("react").ReactNode }) => <>{empty}</>,
}));
import { CertificationPanel } from "./certification-panel";
const id = "22222222-2222-4222-8222-222222222222";
describe("CertificationPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    auth.getAccessToken.mockResolvedValue("token");
    auth.ready = true;
    auth.authenticated = true;
  });
  it("renders public kinds and shows the owner history without changing the detail route", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/me/"))
          return Response.json({
            certifications: [
              {
                id,
                kind: "manual",
                missionId: id,
                title: "콘서트 인증",
                status: "rejected",
                attemptNumber: 1,
                rejectionReason: "티켓 날짜가 보이도록 다시 촬영해 주세요.",
                submittedAt: "2026-09-08T00:00:00.000Z",
                reviewedAt: "2026-09-08T01:00:00.000Z",
                actionHref: `/c/kara/certifications/${id}?locale=ko`,
              },
            ],
          });
        return Response.json({
          certifications: [
            {
              id,
              kind: "manual",
              category: "공연",
              title: "콘서트 인증",
              description: "현장 사진을 제출하세요.",
              status: "available",
              reward: { scorePoints: 2, ticketAmount: 1 },
              actionHref: `/c/kara/certifications/${id}?locale=ko`,
            },
          ],
        });
      });
    render(<CertificationPanel slug="kara" locale="ko" />);
    const mission = await screen.findByRole("link", { name: /콘서트 인증/ });
    expect(mission).toHaveTextContent("+2점");
    expect(mission).toHaveTextContent("+1 응모권");
    fireEvent.click(screen.getByRole("tab", { name: "내 인증 내역" }));
    expect(
      await screen.findByText("티켓 날짜가 보이도록 다시 촬영해 주세요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /콘서트 인증/ })).toHaveAttribute(
      "href",
      `/c/kara/certifications/${id}?locale=ko&submission=${id}`,
    );
    await waitFor(() => expect(auth.getAccessToken).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/me/"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("shows the membership platform and score while omitting a zero ticket reward", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/api/me/"))
        return Response.json({
          certifications: [
            {
              id,
              kind: "manual",
              missionId: id,
              title: "Instagram 유료 멤버십 인증",
              status: "rejected",
              attemptNumber: 1,
              rejectionReason: "계정명이 보이게 제출해 주세요.",
              submittedAt: "2026-09-08T00:00:00.000Z",
              reviewedAt: "2026-09-08T01:00:00.000Z",
              actionHref: `/c/kara/certifications/${id}?locale=ko`,
              membershipPlatform: "instagram",
            },
          ],
        });
      return Response.json({
        certifications: [
          {
            id,
            kind: "manual",
            category: "유료 멤버십",
            title: "Instagram 유료 멤버십 인증",
            description: "현재 유료 멤버십 상태를 인증해 주세요.",
            status: "available",
            reward: { scorePoints: 1, ticketAmount: 0, stampCount: 1 },
            actionHref: `/c/kara/certifications/${id}?locale=ko`,
            membershipPlatform: "instagram",
          },
        ],
      });
    });
    render(<CertificationPanel slug="kara" locale="ko" />);

    const mission = await screen.findByRole("link", {
      name: /Instagram 유료 멤버십 인증/,
    });
    expect(mission).toHaveTextContent("Instagram");
    expect(mission).toHaveTextContent("+1점");
    expect(mission).not.toHaveTextContent("멤버십 스탬프");
    expect(mission).not.toHaveTextContent("응모권");

    fireEvent.click(screen.getByRole("tab", { name: "내 인증 내역" }));
    expect(await screen.findByText("보완 필요")).toBeInTheDocument();
    expect(screen.getByText(/1회차/)).toBeInTheDocument();
  });
  it("keeps the stamp colored only for an approved certification and maps the stamp by kind", async () => {
    const other = "33333333-3333-4333-8333-333333333333";
    const base = { category: "공연", description: "d", reward: null, status: "available" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/api/me/")) return Response.json({ certifications: [{ id, kind: "quiz", missionId: id, title: "퀴즈 인증", status: "approved", attemptNumber: 1, rejectionReason: null, submittedAt: "2026-09-08T00:00:00.000Z", reviewedAt: null, actionHref: "/c/kara/certifications/a" }] });
      return Response.json({ certifications: [
        { ...base, id, kind: "quiz", title: "퀴즈 인증", actionHref: "/c/kara/certifications/a" },
        { ...base, id: other, kind: "live_mission", title: "라이브 인증", actionHref: "/c/kara/certifications/b" },
      ] });
    });
    render(<CertificationPanel slug="kara" locale="ko" />);
    const quiz = await screen.findByRole("link", { name: /퀴즈 인증/ });
    const live = await screen.findByRole("link", { name: /라이브 인증/ });
    await waitFor(() => expect(quiz.querySelector("[data-status]")).toHaveAttribute("data-status", "approved"));
    expect(quiz).toHaveTextContent("인증 완료");
    expect(quiz.querySelector("img")).toHaveAttribute("src", expect.stringContaining("knowledge"));
    expect(live.querySelector("[data-status]")).toHaveAttribute("data-status", "available");
    expect(live.querySelector("img")).toHaveAttribute("src", expect.stringContaining("attendance"));
  });
  it("filters certifications without making preparing or closed items actionable", async () => {
    const base = {
      kind: "manual",
      category: "공연",
      description: "사진을 제출하세요.",
      reward: null,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        certifications: [
          {
            ...base,
            id,
            title: "참여 인증",
            status: "available",
            actionHref: "/c/kara/certifications/one?locale=ko",
          },
          {
            ...base,
            id: "33333333-3333-4333-8333-333333333333",
            title: "예정 인증",
            status: "preparing",
            actionHref: "/preparing",
          },
          {
            ...base,
            id: "44444444-4444-4444-8444-444444444444",
            title: "지난 인증",
            status: "closed",
            actionHref: "/closed",
          },
          {
            ...base,
            id: "55555555-5555-4555-8555-555555555555",
            kind: "quiz",
            category: "팬 인증",
            title: "팬 퀴즈",
            status: "available",
            actionHref: "/c/kara/verify?locale=ko",
          },
        ],
      }),
    );
    render(<CertificationPanel slug="kara" locale="ko" />);
    expect(
      await screen.findByRole("link", { name: /참여 인증/ }),
    ).toHaveAttribute("href", "/c/kara/certifications/one?locale=ko");
    expect(screen.getByText("준비 중")).toBeInTheDocument();
    expect(screen.getByText("종료")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /예정 인증|지난 인증/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "팬 인증" }));
    expect(screen.getByRole("link", { name: /팬 퀴즈/ })).toHaveTextContent(
      "퀴즈 풀기",
    );
    expect(screen.queryByText("참여 인증")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    // The four certifications plus the share proof tile first.
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("share proof");
  });

  it("supports keyboard tabs and keeps signed-out history private", async () => {
    auth.authenticated = false;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ certifications: [] }));
    render(<CertificationPanel slug="kara" locale="en" />);
    // With no certification the list still offers the share proof (D12), instead of an empty line.
    await screen.findByRole("link", { name: "share proof" });
    // ENTRY-STAMP-1321: no proof mission, so no link to an empty proof page.
    expect(screen.queryByRole("link", { name: "Membership and purchase proof" })).not.toBeInTheDocument();
    const missions = screen.getByRole("tab", {
      name: "Verification",
    });
    missions.focus();
    fireEvent.keyDown(missions, { key: "ArrowRight" });
    const history = screen.getByRole("tab", { name: "My history" });
    expect(history).toHaveFocus();
    expect(history).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", expect.stringContaining("/login?returnTo="));
    expect(screen.queryByText("Sign in to see your submission history.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("tabpanel", { name: "My history" }),
    ).toHaveAttribute("id", history.getAttribute("aria-controls"));
    expect(
      fetchMock.mock.calls.every(([url]) => !String(url).includes("/api/me/")),
    ).toBe(true);
    fireEvent.keyDown(history, { key: "Home" });
    expect(missions).toHaveFocus();
    expect(missions).toHaveAttribute("aria-selected", "true");
  });

  it("offers retry after a load error and renders the empty result", async () => {
    let publicCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => String(input).includes("/api/me/") ? Response.json({certifications: []}) : ++publicCalls === 1 ? new Response(null, { status: 500 }) : Response.json({certifications: []}));
    render(<CertificationPanel slug="kara" locale="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "인증을 불러오지 못했어요.",
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("link", { name: "share proof" })).toBeInTheDocument();
  });

  it("falls back to all when a locale change removes the selected category", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      Response.json({
        certifications: [
          {
            id,
            kind: "manual",
            category: String(url).includes("locale=en")
              ? "Membership"
              : "멤버십",
            title: "Instagram",
            description: "Membership verification",
            status: "available",
            reward: null,
            actionHref: "/membership",
          },
        ],
      }),
    );
    const { rerender } = render(<CertificationPanel slug="kara" locale="ko" />);
    fireEvent.click(await screen.findByRole("button", { name: "멤버십" }));
    rerender(<CertificationPanel slug="kara" locale="en" />);
    expect(
      await screen.findByRole("button", { name: "Membership" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("link", { name: /Instagram/ })).toBeInTheDocument();
  });
});

it("shows only the current owner's matching certification status and never invents completion on history failure", async () => {
  auth.ready=true;auth.authenticated=true;auth.getAccessToken.mockResolvedValue("token");
  const item={id,kind:"manual",category:"공연",title:"콘서트 인증",description:"현장 사진",status:"available",reward:null,actionHref:`/c/kara/certifications/${id}`};
  const record={id,kind:"manual",missionId:id,title:item.title,status:"approved",attemptNumber:1,rejectionReason:null,submittedAt:"2026-09-08T00:00:00Z",reviewedAt:"2026-09-08T01:00:00Z",actionHref:item.actionHref};
  vi.spyOn(globalThis,"fetch").mockImplementation(async input=>Response.json({certifications:String(input).includes("/api/me/")?[record]:[item]}));
  render(<CertificationPanel slug="kara" locale="ko"/>);
  const card=await screen.findByRole("link",{name:/콘서트 인증/});
  await waitFor(()=>expect(card.querySelector('[data-status="approved"]')).toHaveTextContent("인증 완료"));
  expect(card).toHaveAttribute("href",item.actionHref);
});

it.each(["pending","rejected"] as const)("keeps %s distinct from approval",async status=>{
 auth.ready=true;auth.authenticated=true;auth.getAccessToken.mockResolvedValue("token");
 const item={id,kind:"manual",category:"공연",title:"콘서트 인증",description:"",status:"available",reward:null,actionHref:`/c/kara/certifications/${id}`};
 vi.spyOn(globalThis,"fetch").mockImplementation(async input=>Response.json({certifications:String(input).includes("/api/me/")?[{id,kind:"manual",missionId:id,title:item.title,status,attemptNumber:1,rejectionReason:null,submittedAt:"2026-09-08T00:00:00Z",reviewedAt:null,actionHref:item.actionHref}]:[item]}));
 render(<CertificationPanel slug="kara" locale="ko"/>);const card=(await screen.findByText("콘서트 인증")).closest("li")!;await waitFor(()=>expect(card.querySelector(`[data-status="${status}"]`)).toBeInTheDocument());if(status==="pending"){expect(card.querySelector("a")).toBeNull();expect(card).not.toHaveTextContent("인증하기");}else expect(card.querySelector("a")).not.toBeNull();expect(card.querySelector('[data-status="approved"]')).toBeNull();
});
it("does not claim approval when the private status request fails",async()=>{
 auth.ready=true;auth.authenticated=true;auth.getAccessToken.mockResolvedValue("token");
 vi.spyOn(globalThis,"fetch").mockImplementation(async input=>String(input).includes("/api/me/")?new Response(null,{status:503}):Response.json({certifications:[{id,kind:"manual",category:"공연",title:"콘서트 인증",description:"",status:"available",reward:null,actionHref:`/c/kara/certifications/${id}`}]}));
 render(<CertificationPanel slug="kara" locale="ko"/>);expect(await screen.findByRole("alert")).toHaveTextContent("내 인증 내역");expect(document.querySelector('[data-status="approved"]')).toBeNull();expect(screen.getByRole("button",{name:"다시 시도"})).toBeEnabled();
});
it("clears prior owner's status immediately on account change",async()=>{
 auth.ready=true;auth.authenticated=true;auth.user.id='did:privy:fan-one';auth.getAccessToken.mockResolvedValue('token');
 const item={id,kind:'manual',category:'공연',title:'콘서트 인증',description:'',status:'available',reward:null,actionHref:`/c/kara/certifications/${id}`};
 const record={id,kind:'manual',missionId:id,title:item.title,status:'approved',attemptNumber:1,rejectionReason:null,submittedAt:'2026-09-08T00:00:00Z',reviewedAt:null,actionHref:item.actionHref};
 let privateReads=0;vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).includes('/api/me/')?(++privateReads===1?Response.json({certifications:[record]}):new Promise<Response>(()=>{})):Response.json({certifications:[item]}));
 const view=render(<CertificationPanel slug='kara' locale='ko'/>);await screen.findByText('인증 완료');auth.user.id='did:privy:fan-two';view.rerender(<CertificationPanel slug='kara' locale='ko'/>);expect(screen.queryByText('인증 완료')).not.toBeInTheDocument();auth.user.id='did:privy:fan-one';
});
it('maps the owned passed quiz to its matching public quiz only',async()=>{
 auth.ready=true;auth.authenticated=true;auth.user.id='did:privy:fan-one';auth.getAccessToken.mockResolvedValue('token');
 const quiz={id,kind:'quiz',category:'팬 인증',title:'Official Fan 인증 퀴즈',description:'',status:'available',reward:null,actionHref:'/c/kara/verify?locale=ko'};
 const other={...quiz,id:'33333333-3333-4333-8333-333333333333',title:'다른 인증'};
 const history={id:'44444444-4444-4444-8444-444444444444',kind:'quiz',missionId:id,title:quiz.title,status:'approved',attemptNumber:1,rejectionReason:null,submittedAt:'2026-09-08T00:00:00Z',reviewedAt:null,actionHref:quiz.actionHref};
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>Response.json({certifications:String(input).includes('/api/me/')?[history]:[quiz,other]}));
 render(<CertificationPanel slug='kara' locale='ko'/>);const card=await screen.findByRole('link',{name:/팬 인증 퀴즈/});await waitFor(()=>expect(card.querySelector('[data-status="approved"]')).toHaveTextContent('인증 완료'));expect(screen.getByRole('link',{name:/다른 인증/}).querySelector('[data-status="approved"]')).toBeNull();
});
it('remembers the list on a quiz click and restores focus to that card link when it returns',async()=>{
 auth.ready=true;auth.authenticated=false;sessionStorage.clear();window.history.replaceState({},'','/c/kara?tab=certifications&locale=ko');
 const quiz={id,kind:'quiz',category:'팬 인증',title:'Official Fan 인증 퀴즈',description:'',status:'available',reward:null,actionHref:'/c/kara/verify?locale=ko'};
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json({certifications:[quiz]}));
 const view=render(<CertificationPanel slug='kara' locale='ko'/>);const card=await screen.findByRole('link',{name:/팬 인증 퀴즈/});
 expect(card).not.toHaveFocus();card.addEventListener('click',e=>e.preventDefault());fireEvent.click(card);
 expect(JSON.parse(sessionStorage.getItem('byus:quiz-close-return')!)).toMatchObject({slug:'kara',href:'/c/kara?tab=certifications&locale=ko',itemId:id});
 rememberQuizFocusReturn(sessionStorage,'kara',id);
 view.unmount();render(<CertificationPanel slug='kara' locale='ko'/>);
 await waitFor(()=>expect(screen.getByRole('link',{name:/팬 인증 퀴즈/})).toHaveFocus());
 expect(sessionStorage.getItem('byus:quiz-focus-return')).toBeNull();
});
