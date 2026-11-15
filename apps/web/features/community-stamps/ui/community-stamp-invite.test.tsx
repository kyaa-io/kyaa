import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inviteRedeemFailure } from "@/features/groups/ui/group-referral-copy";
import { APP_LOCALES, type AppLocale } from "@/i18n/locales";
import { CommunityStampCollection } from "./community-stamp-collection";

const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: toast.show }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "owner" }, getAccessToken: async () => "token" }) }));

const resource = { state: { status: "ready" as const, data: { stamps: [], today: "2026-11-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false };
const reply = (status: number, value: unknown) => Response.json(value, { status });
// The invite row is the last of the Stamp rows in every language; its button opens the invite panel.
const openInvite = async (locale: AppLocale = "ko") => {
  const { container } = render(<CommunityStampCollection locale={locale} resource={resource} />);
  fireEvent.click(container.querySelector("ul li:last-child button")!);
  await screen.findByText("ABCDEF123456");
  return container;
};

beforeEach(() => {
  toast.show.mockReset();
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("copying the invite code says so in a toast, not in a line under the code", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, { code: "ABCDEF123456", redeemed: false, redemptionState: "none" })));
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  await openInvite();
  fireEvent.click(screen.getByRole("button", { name: "복사" }));
  await waitFor(() => expect(toast.show).toHaveBeenCalledWith({ title: "초대코드를 복사했어요.", tone: "success" }));
  expect(writeText).toHaveBeenCalledWith("ABCDEF123456");
  expect(screen.queryByText("초대코드를 복사했어요.")).not.toBeInTheDocument();
});

it("a refused copy keeps the line that asks to select the code", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, { code: "ABCDEF123456", redeemed: false, redemptionState: "none" })));
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  await openInvite();
  fireEvent.click(screen.getByRole("button", { name: "복사" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("코드를 선택해서 복사해 주세요.");
  expect(toast.show).not.toHaveBeenCalled();
});

it.each(APP_LOCALES)("an account that already has a Passport is told why its friend code is refused (409 INVITE_INELIGIBLE) in %s", async locale => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.endsWith("/invite-code")
    ? reply(200, { code: "ABCDEF123456", redeemed: false, redemptionState: "none" })
    : reply(409, { error: { code: "COMMUNITY_STAMP_INVITE_INELIGIBLE" } })));
  const container = await openInvite(locale);
  fireEvent.change(container.querySelector("#community-friend-code")!, { target: { value: "ZYXWVU654321" } });
  fireEvent.submit(container.querySelector("form")!);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(inviteRedeemFailure(locale, "COMMUNITY_STAMP_INVITE_INELIGIBLE"));
  if (locale === "ko") expect(alert).toHaveTextContent("패스포트를 이미 받은 계정은 초대 코드를 등록할 수 없어요.");
  if (locale === "en") expect(alert).toHaveTextContent("Accounts that already have a passport can’t register an invitation code.");
});

it("another refusal keeps its own line and an unknown one the general line", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.endsWith("/invite-code")
    ? reply(200, { code: "ABCDEF123456", redeemed: false, redemptionState: "none" })
    : reply(409, { error: { code: "COMMUNITY_STAMP_ALREADY_REDEEMED" } })));
  const container = await openInvite();
  fireEvent.change(container.querySelector("#community-friend-code")!, { target: { value: "ZYXWVU654321" } });
  fireEvent.submit(container.querySelector("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("이미 친구 코드를 인증했어요.");
});
