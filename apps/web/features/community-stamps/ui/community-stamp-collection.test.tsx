import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { AVAILABLE_COMMUNITY_STAMPS, COMMUNITY_STAMPS } from "../domain/community-stamps";
import { CommunityStampCollection } from "./community-stamp-collection";

vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: "owner" } }) }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

it("offers owned Stamps instead of an endless retry for an unavailable creator, while retaining network retry", () => {
  const retry = vi.fn();
  const resource = { state: { status: "error" as const, kind: "missing" as const }, retry, replaceData: vi.fn(), refreshFailed: false };
  const view = render(<CommunityStampCollection locale="ko" creator="katseye" resource={resource} />);
  expect(screen.getByRole("status")).toHaveTextContent("현재 이 최애의 스탬프 활동을 이용할 수 없어요.");
  expect(screen.getByRole("link", { name: "내 스탬프 보기" })).toHaveAttribute("href", "/my?locale=ko#community-stamps");
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  view.rerender(<CommunityStampCollection locale="ko" creator="katseye" resource={{ ...resource, state: { status: "error", kind: "network" } }} />);
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("sends creator comment activity to the fan feed", () => {
  render(<CommunityStampCollection locale="ko" creator="elina" resource={{ state: { status: "ready", data: { stamps: [], today: "2026-10-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false }} />);
  expect(screen.getByRole("link", { name: "댓글 남기기" })).toHaveAttribute("href", "/elina?tab=board&source=fans&locale=ko#celebrity-content");
});

it.each(APP_LOCALES)("names every Stamp in %s", (locale) => {
  const { container } = render(<CommunityStampCollection locale={locale} resource={{ state: { status: "ready", data: { stamps: [], today: "2026-10-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false }} />);

  for (const kind of AVAILABLE_COMMUNITY_STAMPS) {
    expect(screen.getAllByText(COMMUNITY_STAMPS[kind][locale]).length).toBeGreaterThan(0);
    expect([...container.querySelectorAll("img")].some(image => decodeURIComponent(image.src).includes(`/images/stamps/ink-v1/${kind.replaceAll("_", "-")}.webp`))).toBe(true);
  }
  if (locale !== "en") expect(COMMUNITY_STAMPS.first_comment.help[locale]).not.toBe(COMMUNITY_STAMPS.first_comment.help.en);
});

it("keeps one stamp number on the page by leaving the count to the earned history", () => {
  const creatorStamp = { id: "11111111-1111-4111-8111-111111111111", kind: "first_comment" as const, celebritySlug: "elina", issuedAt: "2026-10-09T00:00:00.000Z", mint: { status: "queued" as const, txHash: null, tokenId: null } };
  const accountStamp = { ...creatorStamp, id: "22222222-2222-4222-8222-222222222222", kind: "welcome" as const, celebritySlug: null };
  const view = render(<CommunityStampCollection locale="ko" creator="elina" resource={{ state: { status: "ready", data: { stamps: [creatorStamp], today: "2026-10-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false }} />);

  expect(screen.queryByText("1개 수집")).not.toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: /스탬프 모으기 기록 보기 · 1/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle.closest("section")!.querySelector("h2")!.parentElement).toContainElement(toggle);

  view.rerender(<CommunityStampCollection locale="ko" resource={{ state: { status: "ready", data: { stamps: [accountStamp], today: "2026-10-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false }} />);
  expect(screen.queryByText("1개 수집")).not.toBeInTheDocument();
});

it.each([
  ["queued", "기록을 등록하고 있어요.", "등록 중"],
  ["processing", "기록을 등록하고 있어요.", "등록 중"],
  ["retryable", "기록을 등록하고 있어요.", "등록 중"],
  ["permanent_failure", "기록 등록 상태를 확인해 주세요.", "확인 필요"],
  ["minted", "기록 등록이 완료됐어요.", "등록 완료"],
] as const)("distinguishes the %s registration status from the earned Stamp", (status, expected, label) => {
  const txHash = status === "minted" ? `0x${"a".repeat(64)}` : null;
  const stamp = { id: "11111111-1111-4111-8111-111111111111", kind: "first_comment" as const, celebritySlug: "elina", issuedAt: "2026-10-09T00:00:00.000Z", mint: { status, txHash, tokenId: status === "minted" ? "42" : null } };
  render(<CommunityStampCollection locale="ko" creator="elina" resource={{ state: { status: "ready", data: { stamps: [stamp], today: "2026-10-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false }} />);

  fireEvent.click(screen.getByRole("button", { name: /스탬프 모으기 기록 보기/ }));
  expect(screen.getByText(label)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "스탬프 보기" }));
  expect(screen.getByText(expected)).toBeInTheDocument();
});

it("does not claim registration is complete when a minted Stamp has no transaction hash", () => {
  const stamp = { id: "11111111-1111-4111-8111-111111111111", kind: "first_comment" as const, celebritySlug: "elina", issuedAt: "2026-10-09T00:00:00.000Z", mint: { status: "minted" as const, txHash: null, tokenId: "42" } };
  render(<CommunityStampCollection locale="ko" creator="elina" resource={{ state: { status: "ready", data: { stamps: [stamp], today: "2026-10-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false }} />);

  fireEvent.click(screen.getByRole("button", { name: "스탬프 보기" }));
  expect(screen.getByText("기록 등록 상태를 확인해 주세요.")).toBeInTheDocument();
  expect(screen.queryByText("기록 등록이 완료됐어요.")).not.toBeInTheDocument();
  expect(screen.getByText("확인 필요")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "탐색기에서 확인" })).not.toBeInTheDocument();
});

const mintedStamp = { id: "11111111-1111-4111-8111-111111111111", kind: "first_comment" as const, celebritySlug: "elina", issuedAt: "2026-10-09T00:00:00.000Z", mint: { status: "minted" as const, txHash: `0x${"a".repeat(64)}`, tokenId: "42" } };
const mintedResource = { state: { status: "ready" as const, data: { stamps: [mintedStamp], today: "2026-10-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false };

it("opens the in-page record list from the Stamp detail without leaving the app", () => {
  const view = render(<CommunityStampCollection locale="ko" creator="elina" resource={mintedResource}/>);
  const details = view.container.querySelector("[data-stamp-history]") as HTMLElement;
  const toggle = screen.getByRole("button", { name: /기록 보기 · 1/ });
  expect(details.hidden).toBe(true);
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(screen.getByRole("button", { name: "스탬프 보기" }));
  expect(screen.queryByRole("link", { name: "등록 기록 보기" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "등록 기록 보기", hidden: true }));

  expect(screen.queryByRole("button", { name: "등록 기록 보기" })).not.toBeInTheDocument();
  expect(details.hidden).toBe(false);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  expect(document.activeElement).toBe(toggle);
  expect(within(details).getByText("등록 완료")).toBeInTheDocument();
});

it("keeps the explorer as a secondary link only for a registered Stamp and hides the shortcut when opened from the list", () => {
  const view = render(<CommunityStampCollection locale="ko" creator="elina" resource={mintedResource}/>);
  fireEvent.click(screen.getByRole("button", { name: "스탬프 보기" }));
  const link = screen.getByRole("link", { name: "탐색기에서 확인", hidden: true });
  expect(link).toHaveAttribute("href", `https://sepolia-explorer.giwa.io/tx/${mintedStamp.mint.txHash}`);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");

  fireEvent.click(screen.getByRole("button", { name: "닫기", hidden: true }));
  const details = view.container.querySelector("[data-stamp-history]") as HTMLElement;
  fireEvent.click(within(details).getByRole("button", { hidden: true }));
  expect(screen.queryByRole("button", { name: "등록 기록 보기" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "탐색기에서 확인", hidden: true })).toBeInTheDocument();
});

it("shows the creator display name, not the slug, in the earned history and omits it when no name is known", () => {
  const stamp = { id: "11111111-1111-4111-8111-111111111111", kind: "quiz" as const, celebritySlug: "p1-smoke-creator", issuedAt: "2026-10-09T00:00:00.000Z", mint: { status: "queued" as const, txHash: null, tokenId: null } };
  const resource = { state: { status: "ready" as const, data: { stamps: [stamp], today: "2026-10-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false };
  const view = render(<CommunityStampCollection locale="ko" creator="p1-smoke-creator" resource={resource} creatorNames={{ "p1-smoke-creator": "시험 크리에이터" }} />);
  expect(view.container.querySelector("[data-stamp-history] small")?.textContent).toMatch(/^시험 크리에이터 · /);
  view.rerender(<CommunityStampCollection locale="ko" creator="p1-smoke-creator" resource={resource} />);
  expect(view.container.querySelector("[data-stamp-history] small")?.textContent).not.toContain("p1-smoke-creator");
});

it("keeps the registration state readable by assistive tech when the record row shows only its icon", () => {
  const view = render(<CommunityStampCollection locale="ko" creator="elina" resource={mintedResource}/>);
  const row = within(view.container.querySelector("[data-stamp-history]") as HTMLElement).getByRole("button", { name: /등록 완료/, hidden: true });
  const state = row.querySelector("small[title]")!;
  expect(state).toHaveAttribute("title", "등록 완료");
  expect(state.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(state).toHaveTextContent("등록 완료");
});

it.each([["ko", "공유"], ["en", "Share"]] as const)("labels the passport sharing action in %s", (locale, label) => {
  render(<CommunityStampCollection locale={locale} resource={{ state: { status: "ready", data: { stamps: [], today: "2026-10-09" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false }} />);
  expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", `/passports?locale=${locale}`);
});
