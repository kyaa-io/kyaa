// ko/en live here; the other locales are in i18n/catalogs/features__group-social__reach.ts.
export const reachSource = {
  notEligible: { ko: "같은 페이지에 가입한 팬이나 친구에게 보낼 수 있어요", en: "You can message friends and fans who joined the same page" },
  recipientOff: { ko: "상대가 대화를 꺼 두었어요", en: "They turned off messages" },
  friendsOnly: { ko: "상대가 친구의 대화 요청만 받아요", en: "They only take message requests from friends" },
  limit: { ko: "오늘 보낼 수 있는 요청을 다 썼어요", en: "You've used today's message requests" },
  pending: { ko: "상대의 수락을 기다리고 있어요", en: "Waiting for them to accept" },
  retryLater: { ko: "아직 다시 요청할 수 없어요", en: "You can't ask again yet" },
  expand: { ko: "전체 화면으로 보기", en: "Open full screen" },
  myRank: { ko: "내 순위", en: "My rank" },
  acceptFriend: { ko: "친구 요청 수락", en: "Accept friend request" },
} as const;
