import type { AppLocale } from "../locales";

/** 래플 상세 페이지의 짧은 이벤트 카피. 한국어·영어를 직접 쓰고 나머지 언어는 영어로 보인다. */
const copy = {
  ko: {
    eventKind: "신규 가입 이벤트", period: "11월 10일 ~ 11월 30일", how: "참여 방법", required: "필수", ended: "응모가 마감됐어요", kst: "한국 시간",
    closesAt: "11월 30일 23:59 마감", giftCard: "Visa 기프트카드", total: "총", totalWinners: "총 17명",
    enterCta: "래플 응모하기", entered: "응모 완료", retry: "다시 시도",
    flowOnce: "1인 1응모",
    step1: "래플 응모하기를 한 번 누르면 참여 완료", step1Guest: "로그인한 뒤 래플 응모하기를 한 번 누르면 참여 완료", step2: "아래 활동으로 당첨 기회 더 받기(선택)",
    oddsRule: "당첨 확률 ≈ 내 당첨 기회 ÷ 전체 당첨 기회 × 17명", oddsMine: "지금 내 확률 약 {pct} (내 기회 {mine}회 · 전체 {total}회)",
    bonusTitle: "당첨 확률 올리기", bonusOnce: "한 번", bonusLimit: "하루 최대 3회", plusOne: "+1", plusThree: "+3", getShort: "받기", joinShort: "가입",
    bonusPassport: "Fan Passport", bonusCommunity: "커뮤니티 가입", bonusComment: "댓글", bonusAttend: "출석",
    bonusInvite: "친구 초대", bonusInviteRule: "내 링크로 가입·응모한 친구 1명마다(인원 제한 없음)", inviteCta: "초대 링크 공유", invitedFriends: "초대한 친구 {0}명",
    checkIn: "출석하기", findPosts: "댓글 달러 가기", myEntry: "내 응모 1회", myChancesLabel: "내 당첨 기회", chancesCount: "{0}회", optional: "선택",
    prizes: "경품", more: "더 즐기기", done: "완료",
    passportTitle: "Fan Passport", 
    communityTitle: "커뮤니티", 
    share: "친구에게 공유", copied: "링크를 복사했어요", notice: "응모 및 당첨 안내",
    notice1: "응모 기간: 2026년 11월 10일 ~ 11월 30일 23:59 (한국 시간)", notice2: "1인 1응모. 응모만 하면 추첨 대상이에요", notice3: "당첨 기회: 응모 1회 + Fan Passport +1 + 커뮤니티 가입 +1 + 댓글·출석 1회당 +1(각각 하루 3회까지, 한국 날짜 기준)",
    notice9: "친구 초대: 내 링크로 가입한 친구가 응모하면 친구 1명당 당첨 기회 +3(인원 제한 없음, 이벤트 기간 중 새로 가입한 친구만)",
    notice4: "여러 계정·자동화 등 부정 참여는 제외돼요", notice5: "당첨자에게는 가입 이메일로 연락해요", notice6: "기프트카드 지급일과 당첨 발표 일정은 안내 예정", notice7: "개인정보는 당첨 연락·지급에만 사용해요",
    notice8: "Visa 가상 기프트카드로 지급해요. 온라인 결제에 쓸 수 있어요",
    resultCta: "결과 확인", resultTitle: "래플 결과", resultWon: "US${0} 당첨", resultLost: "이번에는 당첨되지 않았어요", resultThanks: "응모해 주셔서 고마워요",
    resultClaim: "가입 이메일로 수령 안내를 보내 드려요", resultClaimCta: "수령 안내 보기",
  },
  en: {
    eventKind: "New member event", period: "Nov 10 – Nov 30", how: "How to enter", required: "Required", ended: "This raffle has ended", kst: "Korea time",
    closesAt: "Ends Nov 30, 23:59", giftCard: "Visa gift card", total: "Total", totalWinners: "17 winners",
    enterCta: "Enter the raffle", entered: "You're in", retry: "Try again",
    flowOnce: "One entry per person",
    step1: "Tap Enter the raffle once and you're in", step1Guest: "Sign in, then tap Enter the raffle once and you're in", step2: "Earn more chances with the activities below (optional)",
    oddsRule: "Odds ≈ your chances ÷ all chances × 17 winners", oddsMine: "Your odds now about {pct} (your {mine} of {total} chances)",
    bonusTitle: "Boost your odds", bonusOnce: "Once", bonusLimit: "Up to 3 a day", plusOne: "+1", plusThree: "+3", getShort: "Get", joinShort: "Join",
    bonusPassport: "Fan Passport", bonusCommunity: "Join a community", bonusComment: "Comment", bonusAttend: "Check-in",
    bonusInvite: "Invite friends", bonusInviteRule: "Each friend who joins and enters with your link (no limit)", inviteCta: "Share invite link", invitedFriends: "Friends invited: {0}",
    checkIn: "Check in", findPosts: "Go comment", myEntry: "Your entries: 1", myChancesLabel: "Your chances", chancesCount: "{0}", optional: "Optional",
    prizes: "Prizes", more: "More to enjoy", done: "Done",
    passportTitle: "Fan Passport", 
    communityTitle: "Community", 
    share: "Share with friends", copied: "Link copied", notice: "Entry and winner info",
    notice1: "Period: Nov 10 to Nov 30, 2026, 23:59 (KST)", notice2: "One entry per person. Entering is all you need to be in the draw", notice3: "Chances: 1 for entering, +1 for a Fan Passport, +1 for joining a community, +1 per comment or check-in (up to 3 each a day, KST date)",
    notice9: "Invites: +3 chances for each friend who signs up with your link and enters (no limit, new sign-ups during the event only)",
    notice4: "Multiple accounts or automation are disqualified", notice5: "Winners are contacted by their sign-up email", notice6: "Gift card delivery and winner announcement dates to be announced", notice7: "Personal data is used only to contact and pay winners",
    notice8: "Prizes are Visa virtual gift cards, usable for online payments",
    resultCta: "See my result", resultTitle: "Raffle result", resultWon: "You won US${0}", resultLost: "Not a winner this time", resultThanks: "Thanks for entering",
    resultClaim: "We'll send how to claim it to your sign-up email", resultClaimCta: "How to claim",
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
/** 지금 내 확률 한 줄. 확률(0~1)은 서버가 추첨 방식대로 센 값, 내 기회·전체 기회도 서버 값이다. */
export function raffleOddsText(locale: AppLocale, chance: number, mine: number, total: number): string {
  const pct = chance > 0 && chance < 0.001 ? (locale === "ko" ? "0.1% 미만" : "under 0.1%")
    : new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { style: "percent", maximumFractionDigits: chance < 0.1 ? 1 : 0 }).format(chance);
  const table = locale === "ko" ? copy.ko : copy.en;
  return table.oddsMine.replace("{pct}", pct).replace("{mine}", String(mine)).replace("{total}", String(total));
}
export function raffleLongformText(locale: AppLocale, key: SignupRaffleLongformKey, count?: number): string {
  if (key === "notice8" && prizeRegionNotice[locale]) return prizeRegionNotice[locale];
  const table = locale === "ko" ? copy.ko : copy.en;
  return table[key].replace("{0}", String(count ?? ""));
}
