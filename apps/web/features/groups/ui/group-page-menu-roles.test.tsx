import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupDetail } from "../domain/contracts";
import { GroupPageMenu } from "./group-page-menu";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "actor-a" }, getAccessToken: vi.fn(async () => "local-token") }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "actor-a", generation: 0 }) }));

const page = { id: "20000000-0000-4000-8000-000000000001", kind: "fan", celebrityId: null, slug: "elina", name: "엘리나", description: "", imageUrl: null, question: null, memberCount: 3 } as GroupDetail["page"];
const detail = (role?: "owner" | "manager" | "member") => ({ page, membership: role ? { role, joinedAt: "2026-11-01T00:00:00Z" } : null, bookmarked: false }) as GroupDetail;
function open(role: "owner" | "manager" | "member", canConfigure = false) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/me/presence") ? { enabled: false, canConfigure } : { enabled: true, notices: true, events: true, recipients: true, activity: true })));
  const view = render(<GroupPageMenu detail={detail(role)} locale="ko" refresh={() => {}} />);
  fireEvent.click(view.container.querySelector("summary")!);
  return view;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("GroupPageMenu roles", () => {
  it("draws nothing for a visitor who has not joined", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<GroupPageMenu detail={detail()} locale="ko" refresh={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("gives a fan notifications and leave only", async () => {
    const view = open("member");
    await screen.findByRole("button", { name: "모임 알림 설정" });
    expect(within(view.container).getByRole("button", { name: "모임 나가기" })).toBeInTheDocument();
    for (const name of ["즐겨찾기", "즐겨찾기 해제", "페이지 정보", "행사", "운영 관리", "접속 상태 공개"]) expect(screen.queryByText(name)).toBeNull();
    expect(view.container.querySelector("[data-outbound-kind='social']")).toBeNull();
  });

  it("adds presence for a verified artist", async () => {
    open("member", true);
    expect(await screen.findByRole("button", { name: "접속 상태 공개" })).toBeInTheDocument();
  });

  it("gives a manager events and manage with leave", async () => {
    open("manager");
    await screen.findByRole("button", { name: "모임 알림 설정" });
    expect(screen.getByRole("link", { name: "행사" })).toHaveAttribute("href", expect.stringContaining("section=events"));
    expect(screen.getByRole("link", { name: "운영 관리" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모임 나가기" })).toBeInTheDocument();
  });

  it("sends an owner to the settings section instead of leaving", async () => {
    open("owner");
    await screen.findByRole("button", { name: "모임 알림 설정" });
    expect(screen.getByRole("link", { name: "소유권 이관" })).toHaveAttribute("href", `/pages/groups/${page.id}/manage?locale=ko&section=settings`);
    expect(screen.queryByRole("button", { name: "모임 나가기" })).toBeNull();
    await waitFor(() => expect(screen.queryByText("소유권을 이관한 뒤 나갈 수 있어요.")).toBeNull());
  });
});
