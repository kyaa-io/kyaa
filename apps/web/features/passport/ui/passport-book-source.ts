/** 미션별 스탬프 그림과 틀. 같은 줄에 같은 틀이 붙지 않게 골랐다(3칸씩 한 줄). 틀은 아직 받지 않은 칸의 점선 모양에도 쓴다. */
export const MISSION_STAMP = {
  quiz: { art: "survey", frame: "square" },
  checkin: { art: "daily-checkin", frame: "round" },
  post: { art: "post", frame: "square" },
  comment: { art: "first-comment", frame: "square" },
  share: { art: "share", frame: "round" },
  invite: { art: "invite", frame: "square" },
  subscription: { art: "subscription", frame: "round" },
  steady_checkin: { art: "steady-checkin", frame: "square" },
  proof: { art: "proof", frame: "round" },
} as const;

// Words of the passport book and the tier path; ko/en live here, the other locales in i18n/catalogs/features__passport__ui__passport-book-source.ts.
export const passportBookSource = {
  noNickname: { ko: "닉네임 없음", en: "No nickname" },
  communityHistory: { ko: "스탬프 모으기 기록 보기", en: "View collected Stamps" },
  tierJourneyTitle: { ko: "나와 {0}", en: "You and {0}" },
  tierNow: { ko: "내 팬 등급 {0}", en: "My fan tier: {0}" },
  tierToNext: { ko: "{0}까지 {1}점", en: "{1} pts to {0}" },
  tierToNextStamps: { ko: "{0}까지 도장 {1}칸", en: "Stamps to {0}: {1}" },
  tierToNextHearts: { ko: "{0}까지 하트 {1}개", en: "Hearts to {0}: {1}" },
  pagePrev: { ko: "이전 쪽", en: "Previous page" },
  pageNext: { ko: "다음 쪽", en: "Next page" },
  quizPassedHelper: { ko: "첫 스탬프가 패스포트에 찍혔어요.", en: "Your first stamp is in your Passport." },
  entryReviewTask: { ko: "문제를 풀면 팬 인증이 돼요", en: "Pass the quiz to verify as a fan" },
  entryReviewHelpLabel: { ko: "입국 심사 설명 보기", en: "About the entry review" },
  entryReviewHelp: { ko: "크리에이터에 관한 문제를 풀면 팬 인증이 끝나요. 통과하면 패스포트를 받고, 이 팬페이지에 바로 글과 댓글을 쓰고 자유 소통방에 들어갈 수 있어요.", en: "Answer questions about the creator to verify as a fan. Pass and you get a Passport, and you can post, comment and join the open chat room on this fan page right away." },
  helpClose: { ko: "닫기", en: "Close" },
  missionOnboardTitle: { ko: "미션을 누르면 바로 할 수 있어요", en: "Tap a mission to do it right away" },
  missionOnboardConfirm: { ko: "확인", en: "Got it" },
  switcherLabel: { ko: "내 최애 패스포트", en: "My favorites’ Passports" },
} as const;
