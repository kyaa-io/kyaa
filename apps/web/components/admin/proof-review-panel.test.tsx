import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProofReviewPanel } from "./proof-review-panel";

const id = "11111111-1111-4111-8111-111111111111";
const up = "55555555-5555-4555-8555-555555555555";
const row = { id, status: "pending", revision: 2, createdAt: "2026-11-05T10:00:00Z", proofType: "ticket", publishConsent: true, amountVisible: false,
  applicantName: "A", creatorName: "B", duplicateOf: [id], uploadIds: [up], postBody: "my post text" };

function setup(over: (url: string, method?: string) => unknown = () => null) {
  const request = vi.fn(async (url: string, method?: string, body?: unknown) => {
    const custom = over(url, method);
    if (custom) return custom as { ok: boolean; status: number; data: unknown };
    if (url.includes("/review")) return { ok: true, status: 200, data: { submission: { replayed: false } } };
    return { ok: true, status: 200, data: { submissions: [row] } };
  });
  render(<ProofReviewPanel locale="en" request={request as never} canWrite />);
  return request;
}

describe("ProofReviewPanel", () => {
  it("shows warnings and approves with the row revision", async () => {
    const request = setup();
    expect(await screen.findByText(/Possible duplicate/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/admin/proof-submissions/${id}/review`, "POST", { expectedRevision: 2, decision: "approved" }));
  });

  it.each([["membership", "멤버십"], ["ticket", "티켓"], ["sns_post", "SNS 올리기"]])("localizes proof kind %s consistently", async (proofType, label) => {
    const request = vi.fn(async () => ({ ok: true, status: 200, data: { submissions: [{ ...row, proofType }] } }));
    render(<ProofReviewPanel locale="ko" request={request} canWrite />);
    expect(await screen.findByText(label)).toBeTruthy();
  });

  it("names an SNS post row and shows the paid points after approval (BUGS-261110 B6)", async () => {
    setup((url) => url.includes("/review") ? { ok: true, status: 200, data: { submission: { replayed: false, points: 30 } } }
      : url.includes("proof-submissions") ? { ok: true, status: 200, data: { submissions: [{ ...row, proofType: "sns_post", publishConsent: false, duplicateOf: [] }] } } : null);
    expect(await screen.findByText("SNS post")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Done. Amount 30P")).toBeTruthy();
  });

  it("requires a reason to reject and shows conflict and stamp errors", async () => {
    setup((url) => url.includes("/review") ? { ok: false, status: 409, data: { error: { code: "PROOF_STAMP_UNAVAILABLE" } } } : null);
    await screen.findByText(/Possible duplicate/);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect((await screen.findByRole("alert")).textContent).toContain("reason");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No stamp could be issued"));
  });

  it("shows whether a sanction revoked the title, even on an already void stamp", async () => {
    const id = "99999999-9999-4999-8999-999999999999";
    const result = { replayed: false, pointCorrection: "none", jjinfanRevoked: true };
    const request = vi.fn(async (url: string) => url.includes("/void") ? { ok: true, status: 200, data: { result } } : { ok: true, status: 200, data: { submissions: [] } });
    render(<ProofReviewPanel locale="en" request={request as never} canWrite />);
    fireEvent.change(await screen.findByLabelText("Stamp ID"), { target: { value: id } });
    fireEvent.change(screen.getAllByLabelText("Reason").at(-1)!, { target: { value: "fraud found" } });
    fireEvent.click(screen.getByLabelText("Include sanction"));
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    expect((await screen.findByText(/Stamp voided/)).textContent).toContain("Jjinfan title revoked.");
    expect(screen.queryByText(/Already handled/)).toBeNull();
    result.jjinfanRevoked = false;
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await waitFor(() => expect(screen.getByText(/Stamp voided/).textContent).toContain("No active jjinfan title to revoke."));
  });

  it("shows the replayed notice and voids a stamp", async () => {
    const request = setup((url) => url.includes("/review") ? { ok: true, status: 200, data: { submission: { replayed: true } } }
      : url.includes("/void") ? { ok: true, status: 200, data: { result: { replayed: false, pointCorrection: "review" } } } : null);
    await screen.findByText(/Possible duplicate/);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect((await screen.findByRole("status")).textContent).toContain("Already handled");
    fireEvent.change(screen.getByPlaceholderText("Stamp ID"), { target: { value: id } });
    fireEvent.change(screen.getAllByLabelText("Reason").at(-1)!, { target: { value: "abuse" } });
    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/admin/passport-stamps/${id}/void`, "POST", expect.objectContaining({ reason: "abuse", sanction: false })));
  });

  it("shows the post text and loads a submitted image only on request through the admin link", async () => {
    const request = setup((url) => url.includes("/images/") ? { ok: true, status: 200, data: { image: { url: "https://s3.test/signed?X=1", expiresInSeconds: 120 } } } : null);
    expect(await screen.findByText("my post text")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View image 1" }));
    const img = await screen.findByRole("img", { name: "Submitted image 1" });
    expect(img.getAttribute("src")).toBe("https://s3.test/signed?X=1");
    expect(request).toHaveBeenCalledWith(`/api/admin/proof-submissions/${id}/images/${up}`);
    fireEvent.click(screen.getByRole("button", { name: "Hide image" }));
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows an error and no image when a non-admin link request is refused", async () => {
    setup((url) => url.includes("/images/") ? { ok: false, status: 403, data: { error: { code: "ADMIN_REQUIRED" } } } : null);
    fireEvent.click(await screen.findByRole("button", { name: "View image 1" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Admin rights");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("names the cause when the wallet is off or its writes are paused", async () => {
    const texts: Record<string, string> = {
      GROUP_WALLET_UNAVAILABLE: "The wallet is turned off, so this couldn't be processed.",
      GROUP_WALLET_WRITE_FENCED: "Wallet changes are paused, so this couldn't be processed.",
    };
    for (const code of Object.keys(texts)) {
      const view = render(<ProofReviewPanel locale="en" canWrite request={(async (url: string) => url.includes("/review")
        ? { ok: false, status: 503, data: { error: { code } } } : { ok: true, status: 200, data: { submissions: [row] } }) as never} />);
      await screen.findByText(/Possible duplicate/);
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      expect((await screen.findByRole("alert")).textContent).toBe(texts[code]);
      view.unmount();
    }
  });

  it("says the member is restricted when approval is refused for a restricted account", async () => {
    render(<ProofReviewPanel locale="en" canWrite request={(async (url: string) => url.includes("/review")
      ? { ok: false, status: 403, data: { error: { code: "FAN_WEB_ACTIVE_ACCOUNT_REQUIRED" } } } : { ok: true, status: 200, data: { submissions: [row] } }) as never} />);
    await screen.findByText(/Possible duplicate/);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This member is restricted, so this can't be approved.");
  });

  it("lists point reviews read-only, pages with the last time, and shows the empty and error states", async () => {
    const item = { id: "a1", stampId: "99999999-9999-4999-8999-999999999999", appUserId: "88888888-8888-4888-8888-888888888888", celebrityId: "77777777-7777-4777-8777-777777777777", amount: 30, reason: "action", voidReason: "abuse", createdAt: "2026-11-05T10:00:00Z" };
    const request = setup((url) => url.includes("point-reviews") ? (url.includes("before=")
      ? { ok: true, status: 200, data: { reviews: [], hasMore: false } } : { ok: true, status: 200, data: { reviews: [item], hasMore: true } }) : null);
    await screen.findByText(/Possible duplicate/);
    fireEvent.click(screen.getByRole("button", { name: "Point clawback reviews" }));
    expect(await screen.findByText("88888888")).toBeTruthy();
    expect(screen.getByText("abuse")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/admin/proof-submissions/point-reviews?before=${encodeURIComponent(item.createdAt)}`));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
  });

  it("shows the empty and admin-required states for point reviews", async () => {
    setup((url) => url.includes("point-reviews") ? { ok: true, status: 200, data: { reviews: [], hasMore: false } } : null);
    await screen.findByText(/Possible duplicate/);
    fireEvent.click(screen.getByRole("button", { name: "Point clawback reviews" }));
    expect(await screen.findByText("No point clawbacks to review.")).toBeTruthy();
  });
});
