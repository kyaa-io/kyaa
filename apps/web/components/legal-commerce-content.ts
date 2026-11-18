import type { FanLocale } from "./fan-shell/fan-app-shell";
import type { LegalDocumentContent } from "./legal-content";

export type CommerceDocumentId = "pricing" | "refund";

/**
 * 요금 안내·환불 정책. 한국 소비자법을 따르는 문서라 ko 원문과 en만 둔다.
 * 그 밖의 언어에서는 en 문서를 en 언어 표시로 보인다(화면 틀·라벨은 언어별 번역 그대로).
 * 가격·이용 기간은 케미 가격표 확정본(기획서 12-1, 2026-11-18)을 그대로 옮긴 것이다.
 */
const priceHead = {
  ko: ["상품", "가격(부가세 포함)", "이용 기간"],
  en: ["Item", "Price (VAT included)", "Access period"],
} as const;

export const commerceDocuments: Record<CommerceDocumentId, Record<"ko" | "en", LegalDocumentContent>> = {
  pricing: {
    ko: {
      metadataTitle: "요금 안내 | kyaa",
      metadataDescription: "kyaa 케미 탭 상품의 가격과 이용 기간",
      title: "요금 안내",
      description: "모든 가격은 부가세를 포함한 원화 가격입니다. 결제는 케미 탭 출시와 함께 열리며, 그 전에는 구매할 수 없습니다.",
      effectiveDate: "시행일: 2026년 11월 18일",
      sections: [
        {
          heading: "1. 질문 이용권",
          table: {
            head: priceHead.ko,
            rows: [
              ["질문 이용권 1개", "490원", "구매일부터 5년"],
              ["질문 이용권 5개", "1,900원", "구매일부터 5년"],
              ["질문 이용권 15개", "4,900원", "구매일부터 5년"],
              ["첫 구매 질문 이용권 5개(계정당 1번)", "990원", "구매일부터 5년"],
            ],
          },
          paragraphs: ["질문 이용권 1개로 질문 1번과 이어 묻기 1번을 할 수 있습니다. 답을 하지 못한 경우(AI 실패, 답할 수 없는 질문)에는 이용권을 차감하지 않습니다. 받은 답은 기록에서 다시 볼 수 있습니다."],
        },
        {
          heading: "2. 사주",
          table: {
            head: priceHead.ko,
            rows: [
              ["사주 주제 1개(대운·연애·돈·일과 적성·건강 습관 중 선택)", "1,900원", "구매한 주제는 계속 열람"],
              ["사주 다섯 주제 묶음", "6,900원(이미 구매한 주제 값은 뺀 금액)", "구매한 주제는 계속 열람"],
            ],
          },
        },
        {
          heading: "3. 운세·별자리",
          table: {
            head: priceHead.ko,
            rows: [
              ["오늘의 운세 날짜 1개", "490원", "구매한 날짜는 계속 열람"],
              ["오늘의 운세 좋은 날 찾기", "1,900원", "구매한 결과는 계속 열람"],
              ["별자리 이달 풀이", "990원", "구매한 달(한국 시간) 한 달, 달이 바뀌면 새로 구매"],
              ["별자리 역행·보름 달력", "1,900원", "구매한 해 1년"],
              ["별자리 연애·일·돈(각 1개)", "1,900원", "구매한 주제는 계속 열람"],
            ],
          },
        },
        {
          heading: "4. 타로",
          table: {
            head: priceHead.ko,
            rows: [
              ["타로 3장 배열 1회", "490원", "뽑은 결과는 기록에서 다시 열람(로그인 회원만 저장)"],
              ["타로 3장 배열 3회", "990원", "뽑은 결과는 기록에서 다시 열람(로그인 회원만 저장)"],
            ],
          },
        },
        {
          heading: "5. 궁합·친구·부적",
          table: {
            head: priceHead.ko,
            rows: [
              ["궁합 추가 1번(하루 무료 1번 이후)", "990원", "본 궁합은 계속 열람"],
              ["친구와 오늘·오늘 케미 추가 1번(하루 무료 1번 이후)", "990원", "그날 결과는 계속 열람"],
              ["특별 부적 1장", "1,900원", "기념 앨범에 보관"],
            ],
          },
        },
        {
          heading: "6. 결제 방법과 한도",
          items: [
            "결제는 토스페이먼츠 결제창에서 원화로 하며, 카드와 간편결제(카카오페이·네이버페이 등)를 사용할 수 있습니다.",
            "구독과 정기결제는 없습니다. 포인트로 유료 상품을 구매할 수 없고, 결제해도 포인트를 지급하지 않습니다.",
            "만 19세 미만 회원은 첫 결제 때 보호자 동의를 받으며 한 달에 20,000원까지 결제할 수 있습니다.",
            "회원 탈퇴 시 남은 이용권은 환불 정책에 따라 처리합니다.",
          ],
        },
      ],
    },
    en: {
      metadataTitle: "Pricing | kyaa",
      metadataDescription: "Prices and access periods for kyaa Chemi tab items",
      title: "Pricing",
      description: "All prices are in Korean won and include VAT. Payment opens with the launch of the Chemi tab and is not available before then.",
      effectiveDate: "Effective date: November 18, 2026",
      sections: [
        {
          heading: "1. Question tickets",
          table: {
            head: priceHead.en,
            rows: [
              ["1 question ticket", "KRW 490", "5 years from purchase"],
              ["5 question tickets", "KRW 1,900", "5 years from purchase"],
              ["15 question tickets", "KRW 4,900", "5 years from purchase"],
              ["First-purchase pack of 5 question tickets (once per account)", "KRW 990", "5 years from purchase"],
            ],
          },
          paragraphs: ["One question ticket covers one question and one follow-up. A ticket is not used when no answer is given (AI failure or a question that cannot be answered). Answers you receive stay available in your history."],
        },
        {
          heading: "2. Saju reading",
          table: {
            head: priceHead.en,
            rows: [
              ["1 Saju topic (choose from Major cycles, Love, Money, Work and aptitude, Health habits)", "KRW 1,900", "Purchased topics stay available"],
              ["Bundle of all five Saju topics", "KRW 6,900 (minus the price of topics you already own)", "Purchased topics stay available"],
            ],
          },
        },
        {
          heading: "3. Daily fortune and zodiac",
          table: {
            head: priceHead.en,
            rows: [
              ["Daily fortune, 1 date", "KRW 490", "Purchased dates stay available"],
              ["Daily fortune, find good days", "KRW 1,900", "Purchased results stay available"],
              ["Zodiac reading for this month", "KRW 990", "One calendar month in Korea time; buy again when the month changes"],
              ["Zodiac retrograde and full-moon calendar", "KRW 1,900", "One year, for the year purchased"],
              ["Zodiac love, work or money (each)", "KRW 1,900", "Purchased topics stay available"],
            ],
          },
        },
        {
          heading: "4. Tarot",
          table: {
            head: priceHead.en,
            rows: [
              ["Three-card spread, 1 use", "KRW 490", "Drawn results can be viewed again in your history (saved for signed-in members only)"],
              ["Three-card spread, 3 uses", "KRW 990", "Drawn results can be viewed again in your history (saved for signed-in members only)"],
            ],
          },
        },
        {
          heading: "5. Compatibility, friends and charms",
          table: {
            head: priceHead.en,
            rows: [
              ["Extra compatibility reading, 1 use (after the free daily one)", "KRW 990", "Readings you have seen stay available"],
              ["Extra Today with a friend or Today's Chemi, 1 use (after the free daily one)", "KRW 990", "That day's result stays available"],
              ["Special charm, 1 card", "KRW 1,900", "Kept in your commemorative album"],
            ],
          },
        },
        {
          heading: "6. Payment methods and limits",
          items: [
            "Payment is made in Korean won through the Toss Payments checkout with cards and easy-pay services (such as KakaoPay and Naver Pay).",
            "There are no subscriptions or recurring charges. Paid items cannot be bought with points, and payments do not earn points.",
            "Members under 19 need a guardian's consent for their first payment and can pay up to KRW 20,000 per month.",
            "Unused tickets remaining when you delete your account are handled under the refund policy.",
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
