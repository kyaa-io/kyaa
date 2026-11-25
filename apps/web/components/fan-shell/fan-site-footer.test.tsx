import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locales";
import { FanSiteFooter } from "./fan-site-footer";

const footerCss = readFileSync(
  resolve(process.cwd(), "components/fan-shell/fan-site-footer.module.css"),
  "utf8",
);

describe("FanSiteFooter", () => {
  it("renders the compact auth footer with legal links and business information only", () => {
    render(<FanSiteFooter locale="ko" variant="compact" />);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveAttribute("data-footer-variant", "compact");
    expect(within(footer).queryByRole("navigation")).not.toBeInTheDocument();
    expect(within(footer).queryByRole("heading")).not.toBeInTheDocument();
    expect(footer.querySelectorAll('a[target="_blank"]')).toHaveLength(1);
    expect(within(footer).getByRole("link", { name: "개인정보처리방침 열기" })).toHaveAttribute("href", "/privacy?locale=ko");
    expect(within(footer).getByRole("link", { name: "이용약관 열기" })).toHaveAttribute("href", "/terms?locale=ko");
    expect(within(footer).getByRole("link", { name: "요금 안내 열기" })).toHaveAttribute("href", "/pricing?locale=ko");
    expect(within(footer).getByRole("link", { name: "kyaa 소개 열기" })).toHaveAttribute("href", "/about?locale=ko");
    expect(within(footer).getByRole("link", { name: "환불 정책 열기" })).toHaveAttribute("href", "/refund?locale=ko");
    const groups = footer.querySelectorAll('[role="group"][aria-label] [role="group"]');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("KYAA Inc.");
    expect(groups[1]).toHaveTextContent("736-86-03473");
    expect(footer).toHaveTextContent("주식회사 셀리랩");
  });

  it("publishes the Korean fan navigation and essential legal links", () => {
    render(<FanSiteFooter locale="ko" />);

    const footer = screen.getByRole("contentinfo");
    const navigation = within(footer).getByRole("navigation", { name: "kyaa 하단 메뉴" });
    expect(within(navigation).getByRole("link", { name: "커뮤니티" })).toHaveAttribute("href", "/pages/groups?locale=ko");
    expect(within(navigation).getByRole("link", { name: "팬미팅 협업 문의" })).toHaveAttribute("href", "/pages/us-fanmeetings?locale=ko");
    expect(within(navigation).getByRole("link", { name: "이용 가이드" })).toHaveAttribute("href", "/guide?locale=ko");
    expect(within(navigation).getByRole("link", { name: "패스포트" })).toHaveAttribute("href", "/passports?locale=ko");
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "개인정보처리방침 열기" })).toHaveAttribute("href", "/privacy?locale=ko");
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "이용약관 열기" })).toHaveAttribute("href", "/terms?locale=ko");
    expect(within(navigation).getByRole("heading", { name: "안내 및 문의" })).toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "개인정보처리방침 열기" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("heading", { name: "소셜" })).not.toBeInTheDocument();
    expect(within(footer).getByRole("heading", { name: "소셜" })).toBeInTheDocument();
    const telegram = within(footer).getByRole("link", { name: "kyaa Telegram 채널 열기, 새 창" });
    expect(telegram).toHaveAttribute("href", "https://t.me/Kyaa_Official");
    expect(telegram).toHaveAttribute("target", "_blank");
    expect(telegram).toHaveAttribute("rel", "noopener noreferrer");
    expect(telegram.textContent).toBe("");
    expect(telegram.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(telegram.querySelector("path")).toHaveAttribute("fill", "currentColor");
    expect(within(navigation).getByRole("link", { name: "문의하기" })).toHaveAttribute("href", "/my/inquiries?locale=ko");
    expect(within(navigation).getByRole("link", { name: "온체인 기록" })).toHaveAttribute("href", "/pages/onchain?locale=ko");
    expect(within(navigation).queryByRole("link", { name: "이미지 출처 열기" })).not.toBeInTheDocument();
    expect(footer).toHaveTextContent("support@kyaa.io");
    expect(within(footer).getByText("© 2026 kyaa. All rights reserved.")).toBeInTheDocument();
    expect(footer).not.toHaveTextContent(/Instagram|LinkedIn|채용/);
  });

  it("preserves the English locale on fan routes", () => {
    render(<FanSiteFooter locale="en" />);

    const navigation = screen.getByRole("navigation", { name: "kyaa footer navigation" });
    expect(within(navigation).getByRole("link", { name: "Community" })).toHaveAttribute("href", "/pages/groups?locale=en");
    expect(within(navigation).getByRole("link", { name: "Favorites" })).toHaveAttribute("href", "/celebrities?locale=en");
    expect(within(navigation).getByRole("link", { name: "Fanmeeting partnerships" })).toHaveAttribute("href", "/pages/us-fanmeetings?locale=en");
    expect(within(navigation).getByRole("link", { name: "Service guide" })).toHaveAttribute("href", "/guide?locale=en");
    expect(within(navigation).getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/my/inquiries?locale=en");
    expect(within(navigation).getByRole("link", { name: "Onchain records" })).toHaveAttribute("href", "/pages/onchain?locale=en");
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Open Privacy Policy" })).toHaveAttribute("href", "/privacy?locale=en");
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Open Terms of Use" })).toHaveAttribute("href", "/terms?locale=en");
    expect(within(navigation).getByRole("heading", { name: "Guides & contact" })).toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Open Privacy Policy" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("heading", { name: "Social" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByRole("heading", { name: "Social" })).toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Open kyaa Telegram channel, new window" })).toHaveAttribute("href", "https://t.me/Kyaa_Official");
    expect(within(navigation).queryByRole("link", { name: "Contact" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Open image credits" })).not.toBeInTheDocument();
  });

  it.each(APP_LOCALES)("keeps every service, social, business, and policy group in %s", (locale) => {
    render(<FanSiteFooter locale={locale} />);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("navigation").querySelectorAll("section")).toHaveLength(3);
    expect(within(footer).getByRole("navigation").querySelectorAll("a")).toHaveLength(17);
    expect(footer.querySelectorAll('a[target="_blank"]')).toHaveLength(6);
    const wave = within(footer).getByRole("link", { name: "kyaa wave" });
    expect(wave).toHaveAttribute("href", "https://kyaawave.com/");
    expect(wave).toHaveAttribute("target", "_blank");
    expect(wave).toHaveAttribute("rel", "noopener noreferrer");
    expect(wave).toHaveAttribute("data-outbound-placement", "footer");
    expect(wave).toHaveAttribute("data-outbound-kind", "website");
    expect(footer.querySelector('a[href="https://www.instagram.com/kyaa_app/"]')).toBeInTheDocument();
    expect(footer.querySelector('a[href="https://www.threads.com/@kyaa_app"]')).toBeInTheDocument();
    expect(footer.querySelector('a[href*="x.com/kyaa_app"]')).toHaveAttribute("href", "https://x.com/kyaa_app");
    expect(footer.querySelector(`a[href="/privacy?locale=${locale}"]`)).toBeInTheDocument();
    expect(footer.querySelector("dl")).toBeInTheDocument();
  });

  it("separates the company information from the social group with a divider", () => {
    render(<FanSiteFooter locale="ko" />);
    const footer = screen.getByRole("contentinfo");
    const social = within(footer).getByRole("heading", { name: "소셜" });
    const info = within(footer).getByRole("group", { name: "사업자 정보" });
    expect(social.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(footerCss.match(/\.business\s*\{([^}]*)\}/)?.[1]).toContain("border-top: 1px solid var(--footer-line)");
    expect(footerCss.match(/\.companyMore\s*\{([^}]*)\}/)?.[1]).toContain("border-top: 1px solid var(--footer-line)");
  });

  it.each(APP_LOCALES)("lays out Global HQ and Korea operator as the same three lines in %s", (locale) => {
    for (const variant of ["full", "compact"] as const) {
      const { unmount } = render(<FanSiteFooter locale={locale} variant={variant} />);
      const footer = screen.getByRole("contentinfo");
      const groups = [...footer.querySelectorAll<HTMLElement>("[role=group] [role=group]")];
      expect(groups).toHaveLength(2);
      const [hq, operator] = groups.map((group) => ({
        label: group.querySelector("p")?.textContent,
        lines: [...group.querySelectorAll(":scope > p")].slice(1),
      }));
      expect(hq.lines).toHaveLength(3);
      expect(operator.lines).toHaveLength(3);
      expect(hq.label).toMatch(/\S/);
      expect(operator.label).toMatch(/\S/);
      expect(hq.lines[0]).toHaveTextContent(/^KYAA Inc\. · .+ JAEYEONG KIM$/);
      expect(hq.lines[1]).toHaveTextContent(/8130900$/);
      expect(hq.lines[2]).toHaveTextContent("Whitestone, Queens, NY, USA");
      expect(hq.lines[2]).toHaveAttribute("lang", "en");
      expect(operator.lines[0]).toHaveTextContent(/^주식회사 셀리랩 · .+ 김보석$/);
      expect(operator.lines[1]).toHaveTextContent("736-86-03473");
      expect(operator.lines[2]).toHaveTextContent("서울특별시 강남구 도산대로28길 46, 6층 및 7층 전체(논현동)");
      const lookup = operator.lines[1].querySelector("a");
      expect(lookup).toHaveAttribute("href", "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=7368603473");
      expect(lookup).toHaveAttribute("target", "_blank");
      expect(lookup).toHaveAttribute("rel", "noopener noreferrer");
      expect(lookup).toHaveAttribute("data-outbound-placement", "footer");
      expect(lookup).toHaveAttribute("data-outbound-kind", "website");
      expect(lookup).not.toHaveAttribute("data-outbound-tracking");

      const more = [...footer.querySelectorAll("dl > div")];
      expect(more).toHaveLength(4);
      expect(more[0].querySelector("dd")?.textContent).toBe("제2026-서울강남-06769호");
      expect(footer).not.toHaveTextContent(/신고 준비 중|Filing in progress/);
      expect(more[1].querySelector("dd")).toHaveTextContent("010-6434-8327");
      expect(more[2].querySelector("dd")).toHaveTextContent("support@kyaa.io");
      expect(more[3].querySelector("dd")).toHaveTextContent("Amazon Web Services");
      for (const href of [`/pricing?locale=${locale}`, `/refund?locale=${locale}`]) {
        expect(footer.querySelector(`a[href="${href}"]`)).toBeInTheDocument();
      }
      expect(groups[0].textContent).not.toMatch(/151-17|20th Ave|EIN/);
      unmount();
    }
  });

  it.each([
    ["ko", "글로벌 본사", "한국 운영사", "법인번호(뉴욕주)", "사업자등록번호", "대표자"],
    ["en", "Global HQ", "Korea operator", "NY DOS ID", "Business registration number", "Representative"],
  ] as const)("labels the two groups in %s", (locale, hqLabel, operatorLabel, numberLabel, registrationLabel, representative) => {
    render(<FanSiteFooter locale={locale} />);
    const groups = [...screen.getByRole("contentinfo").querySelectorAll("[role=group] [role=group]")];
    expect(groups[0].querySelector("p")).toHaveTextContent(hqLabel);
    expect(groups[1].querySelector("p")).toHaveTextContent(operatorLabel);
    expect(groups[0].querySelectorAll(":scope > p")[1]).toHaveTextContent(`${representative} JAEYEONG KIM`);
    expect(groups[0].querySelectorAll(":scope > p")[2]).toHaveTextContent(numberLabel);
    expect(groups[1].querySelectorAll(":scope > p")[2]).toHaveTextContent(registrationLabel);
  });

  it.each(APP_LOCALES)("lists the fan guides right under the service guide in %s", (locale) => {
    render(<FanSiteFooter locale={locale} />);

    const guideLinks = [...screen.getByRole("navigation").querySelectorAll("section")[2].querySelectorAll("a")];
    const hrefs = guideLinks.map((link) => link.getAttribute("href"));
    expect(hrefs.slice(0, 5)).toEqual([
      `/guide?locale=${locale}`,
      `/guide/jjinfan?locale=${locale}`,
      `/follow?locale=${locale}`,
      `/bias/promotion?locale=${locale}`,
      `/my/inquiries?locale=${locale}`,
    ]);
    for (const link of guideLinks.slice(1, 4)) {
      expect(link.textContent).toMatch(/\S/);
      expect(link.textContent).not.toContain("kyaa");
      expect(link).not.toHaveAttribute("target");
    }
  });

  it("uses each guide page's own title as the Korean and English link label", () => {
    const labels = {
      ko: ["찐팬 되는 법", "덕질하는 법", "팬페이지 홍보 안내"],
      en: ["How to become a true fan", "How to earn as a fan", "Promote your fan page"],
    } as const;
    for (const locale of ["ko", "en"] as const) {
      const { unmount } = render(<FanSiteFooter locale={locale} />);
      const navigation = screen.getAllByRole("navigation")[0];
      expect(within(navigation).getByRole("link", { name: labels[locale][0] })).toHaveAttribute("href", `/guide/jjinfan?locale=${locale}`);
      expect(within(navigation).getByRole("link", { name: labels[locale][1] })).toHaveAttribute("href", `/follow?locale=${locale}`);
      expect(within(navigation).getByRole("link", { name: labels[locale][2] })).toHaveAttribute("href", `/bias/promotion?locale=${locale}`);
      unmount();
    }
  });

  it("keeps compact responsive groups and accessible controls", () => {
    const linkRule = footerCss.match(/\.navigation a\s*\{([^}]*)\}/)?.[1];
    const navigationRule = footerCss.match(/\.navigation\s*\{([^}]*)\}/)?.[1];
    const serviceGroupRule = footerCss.match(/\.navigation section:last-child\s*\{([^}]*)\}/)?.[1];
    const socialLinkRule = footerCss.match(/\.socialLink\s*\{([^}]*)\}/)?.[1];
    const socialIconRule = footerCss.match(/\.socialLink svg\s*\{([^}]*)\}/)?.[1];

    expect(linkRule).toContain("min-height: 44px");
    expect(linkRule).toContain("font-size: var(--fan-metadata-size)");
    expect(linkRule).toContain("overflow-wrap: anywhere");
    expect(navigationRule).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(serviceGroupRule).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(footerCss).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(footerCss.match(/\.social\s*\{([^}]*)\}/)?.[1]).toContain("grid-column: 1 / -1");
    expect(footerCss.match(/\.socialLinks\s*\{([^}]*)\}/)?.[1]).toContain("flex-direction: row");
    expect(socialLinkRule).toContain("min-width: 44px");
    expect(socialLinkRule).toContain("height: 44px");
    expect(socialLinkRule).toContain("justify-content: center");
    expect(socialIconRule).toContain("width: 20px");
    expect(socialIconRule).toContain("height: 20px");
    expect(footerCss).not.toContain("safe-area-inset-bottom");
  });

  it("reserves the footer wordmark at its rendered SVG ratio", () => {
    render(<FanSiteFooter locale="ko" />);
    const wordmark = screen.getByRole("img", { name: "kyaa" });
    expect(wordmark).toHaveAttribute("width", "96");
    expect(wordmark).toHaveAttribute("height", "46");
  });
});
