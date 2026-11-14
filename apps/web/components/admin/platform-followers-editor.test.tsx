// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlatformFollowersEditor, type AdminPlatformFollower } from "./platform-followers-editor";

const row = (over: Partial<AdminPlatformFollower>): AdminPlatformFollower => ({ celebrityId: "c1", platform: "instagram", count: 12000, sourceText: "1.2만", digits: 2, sourceKind: "manual", sourceUrl: null, checkedAt: "2026-11-14T07:00:00+09:00", ...over });
const input = (name: string) => screen.getByLabelText(new RegExp(name)) as HTMLInputElement;

describe("PlatformFollowersEditor", () => {
  it("shows the platform's wording for a rounded count, the number for an exact one, 0 as 0, and marks a platform nobody confirmed", () => {
    render(<PlatformFollowersEditor celebrityId="c1" locale="ko" canEdit save={vi.fn()} rows={[row({}), row({ platform: "tiktok", count: 0, sourceText: null, digits: null }), row({ platform: "youtube", count: 1088, sourceText: null, digits: null, sourceKind: "collector" })]} />);
    expect(input("Instagram").value).toBe("1.2만");
    expect(input("TikTok").value).toBe("0");
    expect(input("YouTube").value).toBe("1088");
    expect(input("치지직").value).toBe("");
    expect(screen.getByText("미확인")).toBeTruthy();
    expect(screen.getByText("확인 2026-11-14 · 자동 수집")).toBeTruthy();
  });

  it("saves only the platforms that changed; clearing a box sends an empty text (back to unconfirmed)", async () => {
    const save = vi.fn().mockResolvedValue([]);
    render(<PlatformFollowersEditor celebrityId="c1" locale="ko" canEdit save={save} rows={[row({}), row({ platform: "tiktok", count: 5, sourceText: null, digits: null })]} />);
    const button = screen.getByRole("button", { name: "팔로워 저장" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(input("치지직"), { target: { value: "50K" } });
    fireEvent.change(input("TikTok"), { target: { value: "" } });
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith("c1", [{ platform: "tiktok", text: "" }, { platform: "chzzk", text: "50K" }]);
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("will not save text that is not a count, and a viewer gets no save button", () => {
    const view = render(<PlatformFollowersEditor celebrityId="c1" locale="ko" canEdit save={vi.fn()} rows={[]} />);
    fireEvent.change(input("Instagram"), { target: { value: "많음" } });
    expect(input("Instagram").getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: "팔로워 저장" }) as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
    render(<PlatformFollowersEditor celebrityId="c1" locale="ko" canEdit={false} save={vi.fn()} rows={[]} />);
    expect(screen.queryByRole("button", { name: "팔로워 저장" })).toBeNull();
  });
});
