import { KOREA_BUSINESS_INFO } from "./fan-shell/korea-business-info";
import type { FanLocale } from "./fan-shell/fan-app-shell";
import type { LegalDocumentContent } from "./legal-content";
import { HQ_CORPORATE_NUMBER, HQ_COUNTRY, HQ_LOCALITY, HQ_NAME, HQ_REGION, HQ_REPRESENTATIVE } from "@/seo/global-headquarters";

export type AboutDocumentId = "about";

const info = KOREA_BUSINESS_INFO;
const HQ_PLACE = `${HQ_LOCALITY}, ${HQ_REGION}, ${HQ_COUNTRY}`;

/**
 * kyaa 소개: 서비스가 하는 일, 운영 회사, 문의처. 회사 정보는 하단 사업자 정보와 같은 값을 읽는다.
 * 서비스 설명은 공지 'kyaa 이용 가이드'에 있는 내용만 옮긴다. ko 원문과 en만 두고, 그 밖의 언어에서는 en 문서를 en 언어 표시로 보인다.
 */
const aboutDocuments: Record<"ko" | "en", LegalDocumentContent> = {
  ko: {
    metadataTitle: "kyaa 소개 | kyaa",
    metadataDescription: "kyaa에서 하는 일, 운영 회사, 문의처",
    title: "kyaa 소개",
    description: "kyaa는 크리에이터 팬페이지에서 팬 인증 퀴즈를 풀어 팬 패스포트를 받고, LIVE 예약과 출석을 스탬프로 남기는 팬 서비스입니다.",
    sections: [
      {
        heading: "1. kyaa에서 하는 일",
        items: [
          "크리에이터 팬페이지에서 팬 인증 퀴즈를 풉니다. 통과하면 그 크리에이터의 팬 패스포트가 시작됩니다.",
          "예약이 열린 LIVE를 기간 안에 예약합니다. 예약만으로는 출석이 되지 않습니다.",
          "방송 중 LIVE 화면에 안내된 방법으로 출석합니다. LIVE마다 방식과 운영 시간이 다릅니다.",
          "선물은 조건과 기간을 확인한 뒤 직접 응모합니다. 예약이나 출석으로 자동 응모되지 않습니다.",
          "패스포트와 스탬프는 현금, 증권, 투자 상품이나 회사에 대한 권리가 아닙니다.",
        ],
      },
      {
        heading: "2. 운영 회사",
        table: {
          head: ["구분", "글로벌 본사", "한국 운영사"],
          rows: [
            ["회사", HQ_NAME, info.companyName],
            ["대표자", HQ_REPRESENTATIVE, info.representative],
            ["등록번호", `뉴욕주 법인번호 ${HQ_CORPORATE_NUMBER}`, `사업자등록번호 ${info.registrationNumber}`],
            ["소재지", HQ_PLACE, info.address],
          ],
        },
      },
      {
        heading: "3. 문의",
        contact: { before: "서비스 문의는 ", email: info.email, after: "로 보내 주세요." },
        paragraphs: [`대표전화 ${info.phone}`],
      },
    ],
  },
  en: {
    metadataTitle: "About kyaa | kyaa",
    metadataDescription: "What you do on kyaa, the companies that run it, and how to reach us",
    title: "About kyaa",
    description: "kyaa is a fan service where you pass a creator’s fan quiz to start a Fan Passport, then record LIVE reservations and attendance as stamps.",
    sections: [
      {
        heading: "1. What you do on kyaa",
        items: [
          "Take the fan quiz on a creator’s fan page. Passing it starts your Fan Passport for that creator.",
          "Reserve a LIVE while its reservation is open. A reservation alone does not count as attendance.",
          "Check in during the broadcast the way the LIVE screen shows. The method and hours differ for each LIVE.",
          "Enter for gifts yourself after checking the conditions and dates. A reservation or attendance does not enter you automatically.",
          "Passports and stamps are not cash, securities, investment products or rights in the company.",
        ],
      },
      {
        heading: "2. Companies",
        table: {
          head: ["", "Global HQ", "Korea operator"],
          rows: [
            ["Company", HQ_NAME, info.companyName],
            ["Representative", HQ_REPRESENTATIVE, info.representative],
            ["Registration", `NY DOS ID ${HQ_CORPORATE_NUMBER}`, `Business registration number ${info.registrationNumber}`],
            ["Address", HQ_PLACE, info.address],
          ],
        },
      },
      {
        heading: "3. Contact",
        contact: { before: "Send service questions to ", email: info.email, after: "." },
        paragraphs: [`Phone ${info.phone}`],
      },
    ],
  },
};

export function aboutDocument(locale: FanLocale): LegalDocumentContent {
  if (locale === "ko") return aboutDocuments.ko;
  return locale === "en" ? aboutDocuments.en : { ...aboutDocuments.en, lang: "en" };
}
