// 문구는 설정 화면(features/profile/ui/settings-screen.tsx)의 기존 문구를 그대로 쓴다.
// 설정에 없는 말(그만 받기·다시 받기·필수 안내 경고)은 EMAIL-UNSUB-1115 감독 확정(2026-11-15) 문구다.
export const emailUnsubscribeCopy = {
  ko: {
    title: "이 메일 그만 받기",
    preferenceLabels: {
      live_reminders: "LIVE 시작 알림",
      survey_reminders: "설문 참여 알림",
      benefit_notifications: "혜택 오픈 알림",
      reply_notifications: "답글 알림",
      official_post_notifications: "공식 소식",
      schedule_notifications: "일정 알림",
    },
    activityLabel: "활동 소식 메일",
    emailLabel: "Email 수신",
    stop: "그만 받기",
    resume: "다시 받기",
    requiredWarning: "당첨·수령·취소·문의 안내 메일도 함께 멈춰요.",
    saved: "변경 사항을 저장했어요.",
    failed: "저장하지 못했어요. 다시 시도해 주세요.",
    unusable: "로그인 후 설정을 이용할 수 있어요.",
    settings: "설정으로 돌아가기",
  },
  en: {
    title: "Stop receiving these emails",
    preferenceLabels: {
      live_reminders: "LIVE start reminders",
      survey_reminders: "Survey reminders",
      benefit_notifications: "Benefit alerts",
      reply_notifications: "Reply alerts",
      official_post_notifications: "Official posts",
      schedule_notifications: "Schedule alerts",
    },
    activityLabel: "Activity emails",
    emailLabel: "Email delivery",
    stop: "Stop receiving",
    resume: "Receive again",
    requiredWarning: "Emails about wins, pick-up, cancellations and inquiries stop too.",
    saved: "Your changes were saved.",
    failed: "We couldn't save that. Try again.",
    unusable: "Log in to use Settings.",
    settings: "Back to Settings",
  },
} as const;
