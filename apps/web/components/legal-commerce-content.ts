import type { FanLocale } from "./fan-shell/fan-app-shell";
import type { LegalDocumentContent } from "./legal-content";

export type CommerceDocumentId = "pricing" | "refund";

/**
 * 요금 안내·환불 정책. 한국 소비자법을 따르는 문서라 ko 원문과 en만 둔다.
 * 그 밖의 언어에서는 en 문서를 en 언어 표시로 보인다(화면 틀·라벨은 언어별 번역 그대로).
 * 요금 안내는 2026-11-23 케미 운영 오픈 기준: 현금 결제 없음, 포인트 값은 DB `chemi_extra_play_cost()`(20)·`chemi_date_reading_price()`(10)와 같아야 한다.
 * 환불 정책은 유료 결제를 열 때 쓰는 기준으로 그대로 둔다.
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
          paragraphs: ["화면에 표시된 포인트만 차감합니다. 서비스 오류로 열리지 않으면 포인트를 차감하지 않습니다."],
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
          paragraphs: ["Only the points shown on screen are deducted. If an item does not open because of a service error, no points are deducted."],
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
      metadataDescription: "kyaa 디지털 콘텐츠 환불 정책",
      title: "환불 정책",
      description: "kyaa 디지털 콘텐츠 상품의 환불과 청약철회 기준입니다.",
      effectiveDate: "시행일: 2026년 11월 18일",
      sections: [
        {
          heading: "1. 환불 대상과 기간",
          paragraphs: ["열지 않은 풀이와 하나도 쓰지 않은 이용권 묶음은 결제한 시각부터 7일(168시간) 안에 전액 환불받을 수 있습니다. 첫 구매 가격으로 산 묶음은 환불해도 첫 구매 가격이 다시 생기지 않습니다."],
        },
        {
          heading: "2. 청약철회 제한",
          paragraphs: ["이미 열어 본 풀이와 사용한 이용권은 디지털 콘텐츠의 특성상 청약철회가 제한됩니다(전자상거래 등에서의 소비자보호에 관한 법률 제17조 제2항). 결제 전에 이 내용을 안내하고 동의를 받습니다."],
        },
        {
          heading: "3. 환불 방법과 기간",
          items: [
            "MY > 구매 내역에서 환불을 요청합니다.",
            "환불은 결제한 수단으로 취소됩니다. 카드는 취소 후 3~7영업일, 간편결제는 즉시~3영업일 안에 처리됩니다.",
          ],
        },
        {
          heading: "4. 서비스 문제로 이용하지 못한 결제",
          paragraphs: ["결제 뒤 풀이 열기에 실패하는 등 서비스 문제로 이용하지 못한 결제는 자동으로 전액 취소합니다."],
        },
        {
          heading: "5. 회원 탈퇴",
          paragraphs: ["환불 조건(하나도 쓰지 않은 묶음, 결제 뒤 7일 안)에 맞는 이용권은 탈퇴 전에 환불받을 수 있습니다. 나머지 이용권은 탈퇴하면 사라집니다."],
        },
        {
          heading: "6. 만 19세 미만 회원",
          paragraphs: ["만 19세 미만 회원은 첫 결제 때 보호자 동의를 받습니다. 보호자가 동의를 철회해도 이미 구매한 이용권은 계속 쓸 수 있고, 새 결제만 막힙니다."],
        },
        {
          heading: "7. 문의처",
          contact: {
            before: "환불 문의는 kyaa 고객 문의 또는 ",
            email: "support@kyaa.io",
            after: "로 보내 주세요.",
          },
        },
      ],
    },
    en: {
      metadataTitle: "Refund Policy | kyaa",
      metadataDescription: "kyaa digital content refund policy",
      title: "Refund Policy",
      description: "This policy sets out refunds and withdrawal of purchase for kyaa digital content.",
      effectiveDate: "Effective date: November 18, 2026",
      sections: [
        {
          heading: "1. Eligible purchases and period",
          paragraphs: ["A reading you have not opened and a ticket pack you have not used at all can be fully refunded within 7 days (168 hours) of payment. If you refund a pack bought at the first-purchase price, that price is not offered again."],
        },
        {
          heading: "2. Limits on withdrawal of purchase",
          paragraphs: ["Because this is digital content, withdrawal of purchase is limited for readings you have already opened and tickets you have used (Article 17(2) of the Act on the Consumer Protection in Electronic Commerce, etc.). We state this and ask for your agreement before payment."],
        },
        {
          heading: "3. How to request a refund and how long it takes",
          items: [
            "Request a refund in MY > Purchase history.",
            "Refunds are canceled to the original payment method. Cards take 3 to 7 business days after cancellation; easy-pay services take immediately to 3 business days.",
          ],
        },
        {
          heading: "4. Payments that could not be used because of a service problem",
          paragraphs: ["A payment you could not use because of a service problem, such as a reading failing to open after payment, is canceled in full automatically."],
        },
        {
          heading: "5. Account deletion",
          paragraphs: ["Tickets that meet the refund conditions (an unused pack, within 7 days of payment) can be refunded before you delete your account. Other tickets are removed when the account is deleted."],
        },
        {
          heading: "6. Members under 19",
          paragraphs: ["Members under 19 need a guardian's consent for their first payment. If the guardian withdraws consent, tickets already purchased can still be used and only new payments are blocked."],
        },
        {
          heading: "7. Contact",
          contact: {
            before: "For refund questions, use kyaa customer support or email ",
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
