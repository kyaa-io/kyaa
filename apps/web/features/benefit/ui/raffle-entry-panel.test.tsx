import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BenefitCatalogItem } from "../domain/benefit";
import type { RaffleList } from "../domain/raffle";

const submit = vi.fn();
const retry = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: "owner-a" }, getAccessToken: vi.fn() }),
}));

vi.mock("./use-raffle-entry", () => ({
  useRaffleEntry: () => {
    const [unresolvedRequest, setUnresolvedRequest] = useState<null | { idempotencyKey: string; ticketAmount: number }>(null);
    return {
      pending: false,
      unresolvedRequest,
      receipt: null,
      error: unresolvedRequest ? "uncertain" : null,
      reconciling: false,
      reconciled: false,
      submit: async (input: { ticketAmount: number }) => {
        submit(input);
        setUnresolvedRequest({ idempotencyKey: "same-request", ticketAmount: input.ticketAmount });
      },
      retry: async () => { retry(); },
      retryReconciliation: vi.fn(),
      clearReceipt: vi.fn(),
    };
  },
}));

import { RaffleEntryPanel, raffleEntryErrorText } from "./raffle-entry-panel";

const policy = {
  version: "digital-v1",
  method: "digital" as const,
  shippingCountry: null,
  requiresShippingAcknowledgment: false,
  recipientWindowDays: 7 as const,
  pickupEndsOn: null,
  pickupVenue: { ko: "", en: "" },
  pickupInstructions: { ko: "", en: "" },
};

const raffle: RaffleList["raffles"][number] = {
  id: "11111111-1111-4111-8111-111111111111",
  benefitId: "11111111-1111-4111-8111-111111111111",
  title: "선물",
  summary: "선물 설명",
  imageUrl: null,
  winnerQuantity: 1,
  status: "open",
  entryOpensAt: "2026-01-01T00:00:00.000Z",
  entryClosesAt: "2030-01-01T00:00:00.000Z",
  fulfillmentMethod: "digital",
  fulfillmentPolicy: policy,
  perFanTicketLimit: 3,
};

const benefit: BenefitCatalogItem = {
  id: raffle.benefitId!, slug: "gift", title: "선물", summary: "선물 설명",
  eligibilityLabel: "Silver 이상", deliveryLabel: "디지털 지급", deliveryType: "unique_code",
  allocationMode: "direct_claim", applicationStatus: null,
  claimOpensAt: "2026-01-01T00:00:00.000Z", claimClosesAt: "2030-01-01T00:00:00.000Z",
  minimumScore: 0, minimumLevel: "Silver", requiredStampType: null, requiredActivityType: null,
  state: "eligible",
  entry: {
    fulfillmentPolicy: policy, campaignId: "22222222-2222-4222-8222-222222222222",
    creatorTicketBalance: 4, enteredTickets: 1, perFanTicketLimit: 3, remainingBenefitTickets: 3,
    entryOpensAt: "2026-01-01T00:00:00.000Z", entryClosesAt: "2030-01-01T00:00:00.000Z",
    canEnter: true, entries: [],
  },
};

const celebrity = {
  slug: "creator", locale: "ko" as const, name: "Creator", summary: "Creator summary",
  image: { url: "/creator.jpg", alt: "Creator portrait", position: "center" as const },
  roles: ["creator"] as const, themes: [], socialLinks: [], displayOrder: 0, fanCount: 10,
};

describe("raffle entry error copy", () => {
  it("describes a pre-submit durable-storage failure without claiming an uncertain server result", () => {
    expect(raffleEntryErrorText("storage", "ko")).toContain("안전하게 저장하지 못했어요");
    expect(raffleEntryErrorText("storage", "ko")).not.toContain("접수 결과");
    expect(raffleEntryErrorText("storage", "en")).toContain("safely save this entry request");
  });

  it.each([
    ["ko", "1장으로 응모하기", "응모 확정", "같은 응모 요청 확인", "닫기"],
    ["en", "Enter with 1 tickets", "Confirm entry", "Check the same entry", "Close"],
  ] as const)("retries the unresolved request from the open %s confirmation dialog without submitting a new one", async (locale, openLabel, confirmLabel, retryLabel, closeLabel) => {
    submit.mockClear();
    retry.mockClear();
    render(<RaffleEntryPanel
      celebrity={celebrity}
      locale={locale}
      raffle={raffle}
      benefit={benefit}
      loading={false}
      loadFailed={false}
      status="open"
      refresh={vi.fn()}
      onAccepted={vi.fn()}
      onReconciled={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: openLabel }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: confirmLabel }));

    const sameRequest = await within(dialog).findByRole("button", { name: retryLabel });
    expect(sameRequest).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: closeLabel })).toBeEnabled();
    fireEvent.click(sameRequest);

    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(submit).toHaveBeenCalledOnce();
  });
});

describe("standalone raffle fan verification", () => {
  it.each([["ko", "팬 인증하고 응모권 받기"], ["en", "Verify your fan status"]] as const)("requires verification even with a ticket balance in %s", (locale, label) => {
    render(<RaffleEntryPanel celebrity={celebrity} locale={locale}
      raffle={{ ...raffle, requiresFanVerification: true }}
      benefit={{ ...benefit, entry: { ...benefit.entry!, requiresFanVerification: true, fanVerified: false, canEnter: false } }}
      loading={false} loadFailed={false} status="open" refresh={vi.fn()} onAccepted={vi.fn()} onReconciled={vi.fn()} />);
    const link = screen.getByRole("link", { name: label });
    expect(link.getAttribute("href")).toContain(`/c/creator/verify?locale=${locale}&returnTo=`);
    expect(decodeURIComponent(link.getAttribute("href")!)).toContain(`/c/creator/raffles/${raffle.benefitId}?locale=${locale}`);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
  it.each([
    ["ko", "Creator 팬 인증이 필요해요. 인증하면 응모권 1장을 더 받아요."],
    ["en", "Creator fan verification is required. Verifying gives you 1 more ticket."],
  ] as const)("says verification is the reason right away in %s, without a ticket-shortage reading", (locale, text) => {
    render(<RaffleEntryPanel celebrity={celebrity} locale={locale}
      raffle={{ ...raffle, requiresFanVerification: true }}
      benefit={{ ...benefit, entry: { ...benefit.entry!, requiresFanVerification: true, fanVerified: false, canEnter: false } }}
      loading={false} loadFailed={false} status="open" refresh={vi.fn()} onAccepted={vi.fn()} onReconciled={vi.fn()} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/받아 응모할 수 있어요|to receive 1 ticket and enter/)).toBeNull();
  });
  it("calls the shared ticket wallet plain 응모권 and never a creator-only ticket", () => {
    const { container } = render(<RaffleEntryPanel celebrity={celebrity} locale="ko"
      raffle={raffle} benefit={benefit}
      loading={false} loadFailed={false} status="open" refresh={vi.fn()} onAccepted={vi.fn()} onReconciled={vi.fn()} />);
    expect(screen.getByText("응모권 4장 보유")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Creator 응모권|응모권 전용/);
    expect(screen.getByText(/이 선물의 응모 한도 3장/).textContent).toBe("이 선물의 응모 한도 3장");
  });
  describe.each([["ko", "응모가 마감됐어요", "팬 인증 후 응모해요", "팬 인증하고 응모권 받기"], ["en", "Entries are closed", "Verify your fan status to enter", "Verify your fan status"]] as const)("status order: closed > verification needed > open (%s)", (locale, closed, verifyTitle, verifyLabel) => {
    const panel = (status: "open" | "closed", fanVerified: boolean, enteredTickets = 0) => render(<RaffleEntryPanel celebrity={celebrity} locale={locale}
      raffle={{ ...raffle, status, requiresFanVerification: true }}
      benefit={{ ...benefit, entry: { ...benefit.entry!, requiresFanVerification: true, fanVerified, canEnter: fanVerified && status === "open", enteredTickets } }}
      loading={false} loadFailed={false} status={status} refresh={vi.fn()} onAccepted={vi.fn()} onReconciled={vi.fn()} />);
    it("closed and not verified: the title is the closed state; no verification prompt, no picker, no disabled entry button", () => {
      panel("closed", false);
      expect(screen.getByRole("heading", { name: closed })).toBeInTheDocument();
      expect(screen.queryByText(verifyTitle)).toBeNull();
      expect(screen.queryByRole("link", { name: verifyLabel })).toBeNull();
      expect(screen.queryByRole("spinbutton")).toBeNull();
      expect(screen.queryByRole("button", { name: /\d/ })).toBeNull();
      expect(screen.getAllByText(closed)).toHaveLength(1);
    });
    it("closed and verified: the same closed block, and the result note once the fan has entered", () => {
      panel("closed", true, 2);
      expect(screen.getByRole("heading", { name: closed })).toBeInTheDocument();
      expect(screen.queryByRole("spinbutton")).toBeNull();
      expect(screen.queryByRole("button", { name: /\d/ })).toBeNull();
      expect(screen.getByText(locale === "ko" ? "당첨 여부는 결과 발표 후 내 응모 내역에서 확인할 수 있어요." : "Check your raffle entries for the result after the announcement.")).toBeInTheDocument();
    });
    it("open and not verified: the verification prompt and its link", () => {
      panel("open", false);
      expect(screen.getByRole("heading", { name: verifyTitle })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: verifyLabel })).toBeInTheDocument();
      expect(screen.queryByText(closed)).toBeNull();
      expect(screen.queryByRole("spinbutton")).toBeNull();
    });
  });
  it("allows verified fans to choose tickets", () => {
    render(<RaffleEntryPanel celebrity={celebrity} locale="ko"
      raffle={{ ...raffle, requiresFanVerification: true }}
      benefit={{ ...benefit, entry: { ...benefit.entry!, requiresFanVerification: true, fanVerified: true, canEnter: true } }}
      loading={false} loadFailed={false} status="open" refresh={vi.fn()} onAccepted={vi.fn()} onReconciled={vi.fn()} />);
    expect(screen.getByRole("spinbutton")).toBeEnabled();
    expect(screen.queryByRole("link", { name: "팬 인증하고 응모권 받기" })).toBeNull();
  });
});
