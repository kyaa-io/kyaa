import type { FanLocale } from "./fan-shell/fan-app-shell";
import type { LegalDocumentContent } from "./legal-content";

export type CommerceDocumentId = "pricing" | "refund";

/**
 * 요금 안내·환불 정책. 한국 소비자법을 따르는 문서라 ko 원문과 en만 둔다.
 * 그 밖의 언어에서는 en 문서를 en 언어 표시로 보인다(화면 틀·라벨은 언어별 번역 그대로).
 * 요금 안내는 2026-11-23 케미 운영 오픈 기준: 현금 결제 없음, 포인트 값은 DB `chemi_extra_play_cost()`(20)·`chemi_date_reading_price()`(10)와 같아야 한다.
 * 환불 정책은 유료 결제 상품이 없는 동안의 안내다(2026-11-23). 결제를 열 때 환불·청약철회 기준을 다시 쓴다.
 */
const pointHead = {
  ko: ["항목", "포인트", "이용 기준"],
  en: ["Item", "Points", "Conditions"],
} as const;

export const commerceDocuments: Record<CommerceDocumentId, Record<"ko" | "en", LegalDocumentContent>> = {
  pricing: {
    ko: {
      metadataTitle: "요금 안내 | kyaa",
      metadataDescription: "kyaa 케미 탭에서 포인트로 여는 항목과 포인트 값",
      title: "요금 안내",
      description: "케미 탭에는 현금 결제가 없습니다. 아래 항목만 kyaa 포인트로 열고, 나머지 케미 콘텐츠는 무료입니다.",
      effectiveDate: "시행일: 2026년 11월 23일",
      sections: [
        {
          heading: "1. 포인트로 여는 항목",
          table: {
            head: pointHead.ko,
            rows: [
              ["게임 추가 판 1판(짝 맞추기·최애 런)", "20P", "게임마다 하루 무료 3판을 다 한 뒤, 게임마다 하루 3판까지"],
              ["오늘의 운세 다른 날짜 1개", "10P", "같은 최애로 연 날짜는 다시 봐도 포인트를 쓰지 않음"],
            ],
          },
          paragraphs: ["화면에 표시된 포인트만 차감합니다. 게임 판이나 운세가 열린 뒤에만 차감하고, 열리지 않으면 차감하지 않습니다."],
        },
        {
          heading: "2. 결제와 포인트",
          items: [
            "현금·카드·간편결제로 사는 상품은 없습니다. 포인트를 돈으로 충전하거나 살 수도 없습니다.",
            "포인트는 현금으로 바꾸거나 다른 회원에게 넘길 수 없습니다.",
            "포인트를 받고 쓰는 기준은 이용약관 5조(포인트)를 따릅니다.",
            "유료 결제를 열 때는 가격과 결제 방법을 이 페이지에 먼저 알립니다.",
          ],
        },
      ],
    },
    en: {
      metadataTitle: "Pricing | kyaa",
      metadataDescription: "Items in the kyaa Chemi tab that you open with points, and their point values",
      title: "Pricing",
      description: "There are no cash payments in the Chemi tab. Only the items below are opened with kyaa points; all other Chemi content is free.",
      effectiveDate: "Effective date: November 23, 2026",
      sections: [
        {
          heading: "1. Items opened with points",
          table: {
            head: pointHead.en,
            rows: [
              ["Extra game play, 1 play (Match pairs, Favorite Run)", "20P", "After your 3 free plays of that game for the day, up to 3 extra plays per game per day"],
              ["Daily fortune for another date, 1 date", "10P", "Dates you've already opened with the same favorite can be viewed again without points"],
            ],
          },
          paragraphs: ["Only the points shown on screen are deducted. Points are deducted only after the game play or fortune opens. If it does not open, no points are deducted."],
        },
        {
          heading: "2. Payments and points",
          items: [
            "Nothing is sold for cash, card or easy-pay. Points cannot be topped up or bought with money.",
            "Points cannot be exchanged for cash or transferred to another member.",
            "Earning and using points is governed by Section 5 (Points) of the Terms of Service.",
            "Before paid purchases open, we will post their prices and payment methods on this page first.",
          ],
        },
      ],
    },
  },
  refund: {
    ko: {
      metadataTitle: "환불 정책 | kyaa",
      metadataDescription: "kyaa 환불 정책",
      title: "환불 정책",
      description: "현재 kyaa에는 유료 결제 상품이 없습니다.",
      effectiveDate: "시행일: 2026년 11월 23일",
      sections: [
        {
          heading: "1. 환불 대상",
          paragraphs: ["현금·카드·간편결제로 사는 상품이 없어 환불할 결제가 없습니다. 케미 탭에서 포인트를 쓰는 기준은 요금 안내와 이용약관 5조(포인트)를 따릅니다."],
        },
        {
          heading: "2. 유료 결제를 열 때",
          paragraphs: ["유료 결제를 열 때는 환불과 청약철회 기준을 이 페이지에 먼저 알립니다."],
        },
        {
          heading: "3. 문의처",
          contact: {
            before: "문의는 kyaa 고객 문의 또는 ",
            email: "support@kyaa.io",
            after: "로 보내 주세요.",
          },
        },
      ],
    },
    en: {
      metadataTitle: "Refund Policy | kyaa",
      metadataDescription: "kyaa refund policy",
      title: "Refund Policy",
      description: "kyaa currently has no paid products.",
      effectiveDate: "Effective date: November 23, 2026",
      sections: [
        {
          heading: "1. What can be refunded",
          paragraphs: ["Nothing is sold for cash, card or easy-pay, so there are no payments to refund. Using points in the Chemi tab is governed by the Pricing page and Section 5 (Points) of the Terms of Service."],
        },
        {
          heading: "2. When paid purchases open",
          paragraphs: ["Before paid purchases open, we will post the refund and withdrawal rules on this page first."],
        },
        {
          heading: "3. Contact",
          contact: {
            before: "For questions, use kyaa customer support or email ",
            email: "support@kyaa.io",
            after: ".",
          },
        },
      ],
    },
  },
};

/** ko는 원문, 나머지 언어는 en 문서(언어 표시 en)를 쓴다. */
export function commerceDocument(id: CommerceDocumentId, locale: FanLocale): LegalDocumentContent {
  if (locale === "ko") return commerceDocuments[id].ko;
  const document = commerceDocuments[id].en;
  return locale === "en" ? document : { ...document, lang: "en" };
}
