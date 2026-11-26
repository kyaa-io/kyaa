import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locales";
import { legalDocument, legalDocuments, resolveLegalLocale } from "@/components/legal-content";
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
    expect(screen.getByText("시행일: 2026년 11월 26일")).toBeInTheDocument();
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
    expect(screen.getByText(/이벤트·혜택 안내\(광고성 정보\) 이메일 수신에 동의한 경우/)).toBeInTheDocument();
    expect(screen.getByText(/래플·이벤트·혜택 안내\(광고성 정보\)를 이메일로 발송/)).toBeInTheDocument();
    expect(screen.getByText(/동의를 철회하면 해당 이메일 발송을 중단합니다/)).toBeInTheDocument();
    expect(screen.getByText(/설정 > 알림에서 언제든 끄거나 다시 켤 수 있습니다/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" })).toHaveValue("ko");
    expect(screen.getByRole("link", { name: "홈으로 돌아가기" })).toHaveAttribute("href", "/?locale=ko");
  });

  it("publishes the English privacy policy and keeps the English shell", async () => {
    const { container } = render(await PrivacyPage({ searchParams: searchParams("en") }));

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective date: November 26, 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "1. Personal Information We Process" })).toBeInTheDocument();
    expect(screen.getByText(/Google and Privy authentication identifiers/)).toBeInTheDocument();
    expect(screen.getByText(/Name and phone number for physical reward delivery/)).toBeInTheDocument();
    expect(screen.getByText(/30 days after shipping or on-site pickup is completed/)).toBeInTheDocument();
    expect(screen.getByText(/Optional: when you register for Kakao service notifications/)).toBeInTheDocument();
    expect(screen.getByText(/Kakao's phone_number permission/)).toBeInTheDocument();
    expect(screen.getByText(/Processor: 솔라피 주식회사 \(SOLAPI\)/)).toBeInTheDocument();
    expect(screen.getByText(/for one year from the delivery date/)).toBeInTheDocument();
    expect(screen.getByText(/delete the original phone number from kyaa systems and any incomplete registration information/)).toBeInTheDocument();
    expect(screen.getByText(/when you consent to receive event and offer announcement \(advertising\) emails/)).toBeInTheDocument();
    expect(screen.getByText(/sending raffle, event, and offer announcements \(advertising\) by email/)).toBeInTheDocument();
    expect(screen.getByText(/stop sending them when you withdraw it/)).toBeInTheDocument();
    expect(screen.getByText(/turn it off or on again at any time in Settings > Notifications/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose language, currently English" })).toHaveValue("en");
    expect(screen.getByRole("link", { name: "Return home" })).toHaveAttribute("href", "/?locale=en");
    expect(container.querySelector("[data-fan-surface]")).toHaveAttribute("lang", "en");
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
  });

  it("publishes the terms in both languages with Korean governing law", async () => {
    const { unmount } = render(await TermsPage({ searchParams: searchParams("ko") }));
    expect(screen.getByRole("heading", { level: 1, name: "이용약관" })).toBeInTheDocument();
    expect(screen.getByText("시행일: 2026년 11월 23일")).toBeInTheDocument();
    expect(screen.getByText(/대한민국 법률에 따라 해석됩니다/)).toBeInTheDocument();
    unmount();

    render(await TermsPage({ searchParams: searchParams("en") }));
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeInTheDocument();
    expect(screen.getByText("Effective date: November 23, 2026")).toBeInTheDocument();
    expect(screen.getByText(/governed by and construed in accordance with the laws of the Republic of Korea/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose language, currently English" })).toHaveValue("en");
  });

  it("falls back to Korean for missing and unsupported locales", async () => {
    expect(resolveLegalLocale(undefined)).toBe("ko");
    expect(resolveLegalLocale("de")).toBe("ko");

    render(await TermsPage({ searchParams: searchParams("de") }));
    expect(screen.getByRole("heading", { level: 1, name: "이용약관" })).toBeInTheDocument();
  });

  it("shows the English privacy policy under the Japanese shell until the 2026-11-23 revision is translated", async () => {
    const { container } = render(await PrivacyPage({ searchParams: searchParams("ja") }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Privacy Policy");
    expect(container.querySelector("article")).toHaveAttribute("lang", "en");
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
    expect(legalDocuments.terms.en.sections).toHaveLength(10);
  });

  it("preserves English locale in reciprocal legal navigation", async () => {
    render(await TermsPage({ searchParams: searchParams("en") }));

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Open Privacy Policy" })).toHaveAttribute("href", "/privacy?locale=en");
    expect(within(footer).getByRole("link", { name: "Open Terms of Use" })).toHaveAttribute("href", "/terms?locale=en");
  });
  it("publishes the moderation policy and 24-hour response commitment in every locale", () => {
    for (const locale of APP_LOCALES) {
      const policy = legalDocument("terms", locale).sections[5].paragraphs;
      expect(policy).toHaveLength(2);
      expect(policy?.[1]).toContain("24");
      expect(policy?.every(text => text.trim().length > 0)).toBe(true);
    }
    expect(legalDocuments.terms.ko.sections[5].paragraphs?.[0]).toContain("허용하지 않습니다");
    expect(legalDocuments.terms.en.sections[5].paragraphs?.[0]).toContain("zero tolerance");
  });

  it("publishes the 2026-11-23 points clause and Chemi privacy lines, and shows English in other locales", async () => {
    const points = legalDocuments.terms.ko.sections[4]!;
    expect(points.heading).toBe("5. 포인트");
    expect(points.items?.join(" ")).toMatch(/20P.*10P/);
    expect(points.items?.join(" ")).toContain("현금으로 바꾸거나 다른 회원에게 넘길 수 없습니다");
    expect(points.items?.[3]).toBe("포인트는 게임 추가 판이나 다른 날짜의 운세가 열린 뒤에만 차감하고, 열리지 않으면 차감하지 않습니다.");
    expect(points.items?.join(" ")).not.toContain("돌려줍니다");
    const privacy = legalDocuments.privacy.ko.sections;
    expect(privacy[0]!.items?.join(" ")).toContain("생년월일");
    expect(privacy[0]!.items?.join(" ")).toContain("상대의 정보는 회원이 그 사람의 동의를 받은 뒤 입력해야 합니다");
    expect(legalDocuments.privacy.en.sections[0]!.items?.join(" ")).toContain("You must have that person's consent");
    expect(privacy[1]!.items?.join(" ")).toContain("로그인하지 않은 사람도 볼 수 있습니다");
    expect(privacy[2]!.paragraphs?.join(" ")).toContain("만 14세 미만으로 확인되는 생년월일은 저장하지 않습니다");

    const { container } = render(await TermsPage({ searchParams: searchParams("ja") }));
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeInTheDocument();
    expect(screen.getByText("Effective date: November 23, 2026")).toBeInTheDocument();
    expect(container.querySelector("article")).toHaveAttribute("lang", "en");
  });

  it("publishes the Korean pricing page with point items and no cash payment", async () => {
    const { container } = render(await PricingPage({ searchParams: searchParams("ko") }));

    expect(screen.getByRole("heading", { level: 1, name: "요금 안내" })).toBeInTheDocument();
    expect(screen.getByText("시행일: 2026년 11월 23일")).toBeInTheDocument();
    expect(screen.getByText(/케미 탭에는 현금 결제가 없습니다/)).toBeInTheDocument();
    const table = screen.getAllByRole("table")[0]!;
    expect(within(table).getByRole("columnheader", { name: "포인트" })).toBeInTheDocument();
    expect(within(within(table).getByRole("row", { name: /^게임 추가 판 1판/ })).getByRole("cell", { name: "20P" })).toBeInTheDocument();
    expect(within(within(table).getByRole("row", { name: /^오늘의 운세 다른 날짜 1개/ })).getByRole("cell", { name: "10P" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d원|토스페이먼츠|출시와 함께|포인트로 유료 상품을 구매할 수 없/);
    expect(screen.getByRole("link", { name: "홈으로 돌아가기" })).toHaveAttribute("href", "/?locale=ko");
    expect(screen.getByRole("combobox", { name: "언어 선택, 현재 한국어" })).toHaveValue("ko");
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "환불 정책 열기" })).toHaveAttribute("href", "/refund?locale=ko");
  });

  it("publishes the Korean refund policy for a service with no paid products", async () => {
    const { container } = render(await RefundPage({ searchParams: searchParams("ko") }));

    expect(screen.getByRole("heading", { level: 1, name: "환불 정책" })).toBeInTheDocument();
    expect(screen.getByText("현재 kyaa에는 유료 결제 상품이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("시행일: 2026년 11월 23일")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/구매 내역|영업일|168시간/);
    expect(screen.getByRole("link", { name: "support@kyaa.io" })).toHaveAttribute("href", "mailto:support@kyaa.io");
  });

  it("publishes pricing and refund in English and keeps the English shell", async () => {
    const { container, unmount } = render(await PricingPage({ searchParams: searchParams("en") }));
    expect(screen.getByRole("heading", { level: 1, name: "Pricing" })).toBeInTheDocument();
    expect(screen.getByText("Effective date: November 23, 2026")).toBeInTheDocument();
    expect(screen.getAllByText("20P").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/KRW|Toss/);
    expect(screen.getByRole("combobox", { name: "Choose language, currently English" })).toHaveValue("en");
    expect(container.querySelector("[data-fan-surface]")).toHaveAttribute("lang", "en");
    unmount();

    render(await RefundPage({ searchParams: searchParams("en") }));
    expect(screen.getByRole("heading", { level: 1, name: "Refund Policy" })).toBeInTheDocument();
    expect(screen.getByText("kyaa currently has no paid products.")).toBeInTheDocument();
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
