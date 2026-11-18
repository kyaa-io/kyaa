import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locales";
import { legalDocuments, resolveLegalLocale } from "@/components/legal-content";
import PrivacyPage, { generateMetadata as generatePrivacyMetadata } from "./privacy/page";
import PricingPage, { generateMetadata as generatePricingMetadata } from "./pricing/page";
import RefundPage, { generateMetadata as generateRefundMetadata } from "./refund/page";
import { commerceDocuments } from "@/components/legal-commerce-content";
import TermsPage, { generateMetadata as generateTermsMetadata } from "./terms/page";

const searchParams = (locale?: string) => Promise.resolve({ locale });

describe("public legal pages", () => {
  it("publishes the Korean privacy policy with the confirmed operator and contact", async () => {
    render(await PrivacyPage({ searchParams: searchParams("ko") }));

    expect(screen.getByRole("heading", { level: 1, name: "개인정보처리방침" })).toBeInTheDocument();
    expect(screen.getByText("시행일: 2026년 9월 11일")).toBeInTheDocument();
    expect(screen.getAllByText(/Sallylab Inc\./).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "support@kyaa.io" })).toHaveAttribute("href", "mailto:support@kyaa.io");
    expect(screen.getByText(/Google 및 Privy 인증 식별자/)).toBeInTheDocument();
    expect(screen.getByText(/실물 혜택 배송 또는 현장 수령을 위한 이름·연락처/)).toBeInTheDocument();
    expect(screen.getByText(/배송 또는 현장 수령 완료 후 30일/)).toBeInTheDocument();
    expect(screen.getByText(/선택 사항: 카카오 알림톡 수신을 직접 등록한 경우/)).toBeInTheDocument();
    expect(screen.getByText(/Kakao의 phone_number 권한/)).toBeInTheDocument();
    expect(screen.getByText(/수탁자: 솔라피 주식회사\(SOLAPI\)/)).toBeInTheDocument();
    expect(screen.getByText(/메시지 발송 이력을 발송일로부터 1년간 보관/)).toBeInTheDocument();
    expect(screen.getByText(/원본 전화번호와 완료되지 않은 등록 정보를 삭제/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" })).toHaveValue("ko");
    expect(screen.getByRole("link", { name: "홈으로 돌아가기" })).toHaveAttribute("href", "/?locale=ko");
  });

  it("publishes the English privacy policy and keeps the English shell", async () => {
    const { container } = render(await PrivacyPage({ searchParams: searchParams("en") }));

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective date: September 11, 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "1. Personal Information We Process" })).toBeInTheDocument();
    expect(screen.getByText(/Google and Privy authentication identifiers/)).toBeInTheDocument();
    expect(screen.getByText(/Name and phone number for physical reward delivery/)).toBeInTheDocument();
    expect(screen.getByText(/30 days after shipping or on-site pickup is completed/)).toBeInTheDocument();
    expect(screen.getByText(/Optional: when you register for Kakao service notifications/)).toBeInTheDocument();
    expect(screen.getByText(/Kakao's phone_number permission/)).toBeInTheDocument();
    expect(screen.getByText(/Processor: 솔라피 주식회사 \(SOLAPI\)/)).toBeInTheDocument();
    expect(screen.getByText(/for one year from the delivery date/)).toBeInTheDocument();
    expect(screen.getByText(/delete the original phone number from kyaa systems and any incomplete registration information/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose language, currently English" })).toHaveValue("en");
    expect(screen.getByRole("link", { name: "Return home" })).toHaveAttribute("href", "/?locale=en");
    expect(container.querySelector("[data-fan-surface]")).toHaveAttribute("lang", "en");
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
  });

  it("publishes the terms in both languages with Korean governing law", async () => {
    const { unmount } = render(await TermsPage({ searchParams: searchParams("ko") }));
    expect(screen.getByRole("heading", { level: 1, name: "이용약관" })).toBeInTheDocument();
    expect(screen.getByText("시행일: 2026년 10월 20일")).toBeInTheDocument();
    expect(screen.getByText(/대한민국 법률에 따라 해석됩니다/)).toBeInTheDocument();
    unmount();

    render(await TermsPage({ searchParams: searchParams("en") }));
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeInTheDocument();
    expect(screen.getByText("Effective date: October 20, 2026")).toBeInTheDocument();
    expect(screen.getByText(/governed by and construed in accordance with the laws of the Republic of Korea/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose language, currently English" })).toHaveValue("en");
  });

  it("falls back to Korean for missing and unsupported locales", async () => {
    expect(resolveLegalLocale(undefined)).toBe("ko");
    expect(resolveLegalLocale("de")).toBe("ko");

    render(await TermsPage({ searchParams: searchParams("de") }));
    expect(screen.getByRole("heading", { level: 1, name: "이용약관" })).toBeInTheDocument();
  });

  it("renders Japanese legal content for a supported locale", async () => {
    render(await PrivacyPage({ searchParams: searchParams("ja") }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("プライバシーポリシー");
  });

  it("localizes legal metadata", async () => {
    await expect(generatePrivacyMetadata({ searchParams: searchParams("en") })).resolves.toMatchObject({
      title: "Privacy Policy | kyaa",
      description: "kyaa Privacy Policy",
    });
    await expect(generateTermsMetadata({ searchParams: searchParams("ko") })).resolves.toMatchObject({
      title: "이용약관 | kyaa",
      description: "kyaa 서비스 이용약관",
    });
  });

  it("keeps Korean and English section contracts aligned", () => {
    expect(legalDocuments.privacy.ko.sections).toHaveLength(legalDocuments.privacy.en.sections.length);
    expect(legalDocuments.terms.ko.sections).toHaveLength(legalDocuments.terms.en.sections.length);
    expect(legalDocuments.privacy.en.sections).toHaveLength(8);
    expect(legalDocuments.terms.en.sections).toHaveLength(9);
  });

  it("preserves English locale in reciprocal legal navigation", async () => {
    render(await TermsPage({ searchParams: searchParams("en") }));

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Open Privacy Policy" })).toHaveAttribute("href", "/privacy?locale=en");
    expect(within(footer).getByRole("link", { name: "Open Terms of Use" })).toHaveAttribute("href", "/terms?locale=en");
  });
  it("publishes the moderation policy and 24-hour response commitment in every locale", () => {
    for (const locale of APP_LOCALES) {
      const policy = legalDocuments.terms[locale].sections[4].paragraphs;
      expect(policy).toHaveLength(2);
      expect(policy?.[1]).toContain("24");
      expect(policy?.every(text => text.trim().length > 0)).toBe(true);
    }
    expect(legalDocuments.terms.ko.sections[4].paragraphs?.[0]).toContain("허용하지 않습니다");
    expect(legalDocuments.terms.en.sections[4].paragraphs?.[0]).toContain("zero tolerance");
  });

  it("publishes the Korean pricing page with the confirmed prices and launch condition", async () => {
    render(await PricingPage({ searchParams: searchParams("ko") }));

    expect(screen.getByRole("heading", { level: 1, name: "요금 안내" })).toBeInTheDocument();
    expect(screen.getByText("시행일: 2026년 11월 18일")).toBeInTheDocument();
    expect(screen.getByText(/결제는 케미 탭 출시와 함께 열리며/)).toBeInTheDocument();
    const table = screen.getAllByRole("table")[0]!;
    expect(within(table).getByRole("columnheader", { name: "가격(부가세 포함)" })).toBeInTheDocument();
    const row = within(table).getByRole("row", { name: /^첫 구매 질문 이용권 5개/ });
    expect(within(row).getByRole("cell", { name: "990원" })).toBeInTheDocument();
    for (const price of ["490원", "1,900원", "4,900원", "6,900원"]) expect(screen.getAllByText(new RegExp(`^${price}`)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("구매일부터 5년")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "홈으로 돌아가기" })).toHaveAttribute("href", "/?locale=ko");
    expect(screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" })).toHaveValue("ko");
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "환불 정책 열기" })).toHaveAttribute("href", "/refund?locale=ko");
  });

  it("publishes the Korean refund policy with its legal basis, method, period and contact", async () => {
    render(await RefundPage({ searchParams: searchParams("ko") }));

    expect(screen.getByRole("heading", { level: 1, name: "환불 정책" })).toBeInTheDocument();
    expect(screen.getByText(/결제한 시각부터 7일\(168시간\) 안에 전액 환불/)).toBeInTheDocument();
    expect(screen.getByText(/청약철회가 제한됩니다\(전자상거래 등에서의 소비자보호에 관한 법률 제17조 제2항\)/)).toBeInTheDocument();
    expect(screen.getByText(/MY > 구매 내역에서 환불을 요청합니다/)).toBeInTheDocument();
    expect(screen.getByText(/카드는 취소 후 3~7영업일, 간편결제는 즉시~3영업일/)).toBeInTheDocument();
    expect(screen.getByText(/자동으로 전액 취소합니다/)).toBeInTheDocument();
    expect(screen.getByText(/만 19세 미만 회원은 첫 결제 때 보호자 동의를 받습니다/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@kyaa.io" })).toHaveAttribute("href", "mailto:support@kyaa.io");
  });

  it("publishes pricing and refund in English and keeps the English shell", async () => {
    const { container, unmount } = render(await PricingPage({ searchParams: searchParams("en") }));
    expect(screen.getByRole("heading", { level: 1, name: "Pricing" })).toBeInTheDocument();
    expect(screen.getByText("Effective date: November 18, 2026")).toBeInTheDocument();
    expect(screen.getAllByText("KRW 990").length).toBeGreaterThan(0);
    expect(screen.getByRole("combobox", { name: "Choose language, currently English" })).toHaveValue("en");
    expect(container.querySelector("[data-fan-surface]")).toHaveAttribute("lang", "en");
    unmount();

    render(await RefundPage({ searchParams: searchParams("en") }));
    expect(screen.getByRole("heading", { level: 1, name: "Refund Policy" })).toBeInTheDocument();
    expect(screen.getByText(/within 7 days \(168 hours\) of payment/)).toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Open Pricing" })).toHaveAttribute("href", "/pricing?locale=en");
  });

  it("shows the English commerce documents under the localized shell in other locales", async () => {
    const { container } = render(await RefundPage({ searchParams: searchParams("ja") }));
    expect(screen.getByRole("heading", { level: 1, name: "Refund Policy" })).toBeInTheDocument();
    expect(container.querySelector("article")).toHaveAttribute("lang", "en");
  });

  it("localizes pricing and refund metadata and keeps ko/en sections aligned", async () => {
    await expect(generatePricingMetadata({ searchParams: searchParams("en") })).resolves.toMatchObject({ title: "Pricing | kyaa" });
    await expect(generateRefundMetadata({ searchParams: searchParams("ko") })).resolves.toMatchObject({ title: "환불 정책 | kyaa" });
    for (const id of ["pricing", "refund"] as const) {
      const { ko, en } = commerceDocuments[id];
      expect(ko.sections).toHaveLength(en.sections.length);
      ko.sections.forEach((section, index) => {
        const english = en.sections[index]!;
        expect(Boolean(section.table), `${id}/${index}`).toBe(Boolean(english.table));
        expect(section.table?.rows.length).toBe(english.table?.rows.length);
        expect(section.items?.length).toBe(english.items?.length);
      });
    }
  });
});
