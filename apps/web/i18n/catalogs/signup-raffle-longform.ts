import type { AppLocale } from "../locales";

/** 래플 롱폼 페이지의 짧은 이벤트 카피. 한국어·영어를 직접 쓰고 나머지 언어는 영어로 보인다. */
const copy = {
  ko: {
    daysLeft: "{0}일 남음", lastDay: "오늘 마감", ended: "응모가 마감됐어요", kst: "한국 시간 기준",
    stepChip: "STEP {0}", prizes: "경품", totalWinners: "총 17명", howTo: "참여방법",
    enterTitle: "응모", enterLine: "버튼 한 번이면 끝", enterAccent: "한 번",
    passportTitle: "Fan Passport", passportLine: "KYAA 팬 신분증. 받으면 스탬프와 포인트가 쌓여요", passportAccent: "스탬프와 포인트",
    communityTitle: "커뮤니티", communityLine: "좋아하는 크리에이터 팬들이 모인 공간", communityAccent: "팬들",
    bonusTitle: "당첨 확률 올리기", bonusComment: "댓글 1번", bonusAttend: "출석 1번", bonusChance: "기회 +1", bonusCap: "하루 각 3번까지",
    myStatus: "내 참여 현황", progress: "3단계 중 {0}단계 완료", done: "완료", todo: "미완료",
    entered: "응모 완료", celebrate: "응모 완료! 매일 댓글·출석으로 기회를 늘려 보세요",
    checkIn: "출석하기", findPosts: "댓글 달 글 보러 가기", retry: "다시 시도",
    share: "친구에게 공유", copied: "링크를 복사했어요", notice: "유의사항",
    notice1: "응모 기간: 2026년 11월 10일 ~ 11월 30일 23:59 (한국 시간)", notice2: "1인 1응모", notice3: "당첨 확률 반영은 댓글·출석 각각 하루 3번까지(한국 날짜 기준)",
    notice4: "여러 계정·자동화 등 부정 참여는 제외돼요", notice5: "당첨자에게는 가입 이메일로 연락해요", notice6: "지급 방식과 당첨 발표 일정은 안내 예정", notice7: "개인정보는 당첨 연락·지급에만 사용해요",
  },
  en: {
    daysLeft: "{0} days left", lastDay: "Last day", ended: "This raffle has ended", kst: "Korea time (KST)",
    stepChip: "STEP {0}", prizes: "Prizes", totalWinners: "17 winners in total", howTo: "How to enter",
    enterTitle: "Enter", enterLine: "One tap and you're in", enterAccent: "One tap",
    passportTitle: "Fan Passport", passportLine: "Your KYAA fan ID. Collect stamps and points", passportAccent: "stamps and points",
    communityTitle: "Community", communityLine: "A space for fans of the creators you love", communityAccent: "fans",
    bonusTitle: "Boost your odds", bonusComment: "1 comment", bonusAttend: "1 check-in", bonusChance: "+1 chance", bonusCap: "Up to 3 each per day",
    myStatus: "My progress", progress: "{0} of 3 steps done", done: "Done", todo: "To do",
    entered: "You're in", celebrate: "You're in! Comment and check in every day to add chances",
    checkIn: "Check in", findPosts: "Find posts to comment on", retry: "Try again",
    share: "Share with friends", copied: "Link copied", notice: "Notes",
    notice1: "Period: Nov 10 to Nov 30, 2026, 23:59 (KST)", notice2: "One entry per person", notice3: "Chances count up to 3 comments and 3 check-ins per day (KST date)",
    notice4: "Multiple accounts or automation are disqualified", notice5: "Winners are contacted by their sign-up email", notice6: "Payout method and announcement date to be announced", notice7: "Personal data is used only to contact and pay winners",
  },
} as const;

export type SignupRaffleLongformKey = keyof typeof copy.ko;
export function raffleLongformText(locale: AppLocale, key: SignupRaffleLongformKey, count?: number): string {
  const table = locale === "ko" ? copy.ko : copy.en;
  return table[key].replace("{0}", String(count ?? ""));
}
