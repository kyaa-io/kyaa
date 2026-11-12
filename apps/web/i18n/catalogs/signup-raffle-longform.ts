import type { AppLocale } from "../locales";

/** 래플 상세 페이지의 짧은 이벤트 카피. 한국어·영어를 직접 쓰고 나머지 언어는 영어로 보인다. */
const copy = {
  ko: {
    daysLeft: "{0}일 남음", lastDay: "오늘 마감", ended: "응모가 마감됐어요", kst: "한국 시간",
    closesAt: "11월 30일 23:59 마감", giftCard: "Visa 기프트카드", total: "총", totalWinners: "총 17명", totalPrize: "총 US$400",
    enterCta: "래플 응모하기", entered: "응모 완료", retry: "다시 시도",
    flowOnce: "1인 1응모",
    bonusTitle: "당첨 확률 올리기", bonusRate: "1회당 +1", bonusLimit: "하루 최대 3회",
    bonusComment: "댓글", bonusAttend: "출석", bonusEach: "+1", bonusPerDay: "하루 3회",
    checkIn: "출석하기", findPosts: "댓글 달러 가기", myEntry: "내 응모 1회", optional: "선택",
    prizes: "경품", more: "더 즐기기", done: "완료",
    passportTitle: "Fan Passport", 
    communityTitle: "커뮤니티", 
    share: "친구에게 공유", copied: "링크를 복사했어요", notice: "응모 및 당첨 안내",
    notice1: "응모 기간: 2026년 11월 10일 ~ 11월 30일 23:59 (한국 시간)", notice2: "1인 1응모", notice3: "당첨 확률 반영은 댓글·출석 각각 하루 3회까지(한국 날짜 기준)",
    notice4: "여러 계정·자동화 등 부정 참여는 제외돼요", notice5: "당첨자에게는 가입 이메일로 연락해요", notice6: "기프트카드 지급일과 당첨 발표 일정은 안내 예정", notice7: "개인정보는 당첨 연락·지급에만 사용해요",
    notice8: "Visa 가상 기프트카드로 지급해요. 온라인 결제에 쓸 수 있어요",
  },
  en: {
    daysLeft: "{0} days left", lastDay: "Last day", ended: "This raffle has ended", kst: "Korea time",
    closesAt: "Ends Nov 30, 23:59", giftCard: "Visa gift card", total: "Total", totalWinners: "17 winners", totalPrize: "US$400 in total",
    enterCta: "Enter the raffle", entered: "You're in", retry: "Try again",
    flowOnce: "One entry per person",
    bonusTitle: "Boost your odds", bonusRate: "+1 each time", bonusLimit: "Up to 3 a day",
    bonusComment: "Comment", bonusAttend: "Check-in", bonusEach: "+1", bonusPerDay: "3 a day",
    checkIn: "Check in", findPosts: "Go comment", myEntry: "Your entries: 1", optional: "Optional",
    prizes: "Prizes", more: "More to enjoy", done: "Done",
    passportTitle: "Fan Passport", 
    communityTitle: "Community", 
    share: "Share with friends", copied: "Link copied", notice: "Entry and winner info",
    notice1: "Period: Nov 10 to Nov 30, 2026, 23:59 (KST)", notice2: "One entry per person", notice3: "Chances count up to 3 comments and 3 check-ins per day (KST date)",
    notice4: "Multiple accounts or automation are disqualified", notice5: "Winners are contacted by their sign-up email", notice6: "Gift card delivery and winner announcement dates to be announced", notice7: "Personal data is used only to contact and pay winners",
    notice8: "Prizes are Visa virtual gift cards, usable for online payments",
  },
} as const;

/** 지급 방식 안내(사용자 결정 2026-11-13: Visa 가상 기프트카드, 온라인 결제용)는 당첨 조건이라 주요 6개 언어로 직접 쓴다. 나머지 언어는 영어. */
const prizeRegionNotice: Partial<Record<AppLocale, string>> = {
  ja: "Visaバーチャルギフトカードでお渡しします。オンライン決済で使えます",
  "zh-Hans": "奖品以 Visa 虚拟礼品卡发放，可用于网上支付",
  "zh-Hant": "獎品以 Visa 虛擬禮品卡發放，可用於線上付款",
  es: "Los premios se entregan como tarjetas regalo virtuales Visa, válidas para pagos en línea",
};

export type SignupRaffleLongformKey = keyof typeof copy.ko;
export function raffleLongformText(locale: AppLocale, key: SignupRaffleLongformKey, count?: number): string {
  if (key === "notice8" && prizeRegionNotice[locale]) return prizeRegionNotice[locale];
  const table = locale === "ko" ? copy.ko : copy.en;
  return table[key].replace("{0}", String(count ?? ""));
}
