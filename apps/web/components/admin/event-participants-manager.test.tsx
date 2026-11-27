import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ user: { id: "admin" }, getAccessToken: async () => "token" }) }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => ({ status: "authorized", admin: { email: "ops@byus.test", role: "viewer" } }) }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
import { EventParticipantsManager } from "./event-participants-manager";

const asOf = "2026-11-17T05:00:00.000+00:00";
const row = (n: number, sourceTag?: { source: string; content: string } | null) => ({
  id: `10000000-0000-4000-8000-00000000000${n}`, nickname: `팬${n}`, signedUpAt: "2026-11-17T01:00:00+00:00", participatedAt: "2026-11-17T02:00:00+00:00", status: "completed", ...(sourceTag === undefined ? {} : { sourceTag }),
});
const page = (rows: ReturnType<typeof row>[], sourceTotals?: { source: string; content: string; count: number }[]) => ({ asOf, total: rows.length, rows, next: null, ...(sourceTotals ? { sourceTotals } : {}) });

describe("event participants source tags", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  const answer = (body: unknown) => fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body });

  it("shows each participant's first source and the totals per source, with the untagged remainder", async () => {
    answer(page([row(1), row(2), row(3), row(4)]));
    render(<EventParticipantsManager locale="ko" />);
    await screen.findByText("팬1");
    expect(screen.queryByText("가입 경로")).not.toBeInTheDocument(); // X mission: no campaign, no source column
    expect(fetchMock.mock.calls[0][0]).not.toContain("campaign=");

    answer(page([row(1, { source: "telegram", content: "cgaa" }), row(2, { source: "telegram", content: "cgaa" }), row(3, { source: "kol", content: "kol1" }), row(4, null)],
      [{ source: "telegram", content: "cgaa", count: 2 }, { source: "kol", content: "kol1", count: 1 }]));
    fireEvent.click(screen.getByRole("button", { name: "엘리나 11/17" }));
    const totals = await screen.findByRole("region", { name: "가입 경로" });
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("campaign=elina-onboarding-1117"));
    const items = within(totals).getAllByRole("listitem").map(item => item.textContent);
    expect(items).toEqual(["텔레그램 · cgaa2명", "KoL · kol11명", "표시 없음1명"]);
    const rows = screen.getAllByRole("row").slice(1).map(tr => within(tr).getAllByRole("cell").at(-1)?.textContent);
    expect(rows).toEqual(["텔레그램 · cgaa", "텔레그램 · cgaa", "KoL · kol1", "표시 없음"]);
  });
  it("counts everyone as untagged when no tag was recorded", async () => {
    answer(page([row(1, null), row(2, null)], []));
    render(<EventParticipantsManager locale="ko" />);
    fireEvent.click(await screen.findByRole("button", { name: "엘리나 11/17" }));
    const totals = await screen.findByRole("region", { name: "가입 경로" });
    expect(within(totals).getAllByRole("listitem").map(item => item.textContent)).toEqual(["표시 없음2명"]);
  });
});
