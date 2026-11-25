import type { AppLocale } from "../locales";

/** 래플 상세 페이지의 짧은 이벤트 카피. 한국어·영어를 직접 쓰고 나머지 언어는 영어로 보인다. */
const copy = {
  ko: {
    eventKind: "신규 가입 이벤트", period: "11월 10일 ~ 12월 13일", how: "참여 방법", required: "필수", ended: "응모가 마감됐어요", kst: "한국 시간",
    closesAt: "12월 13일 23:59 마감", giftCard: "Visa 기프트카드", total: "총", totalWinners: "총 17명",
    enterCta: "래플 응모하기", entered: "응모 완료", retry: "다시 시도",
    flowOnce: "1인 1응모",
    inAppGuide: "브라우저에서 열어 응모하세요: 오른쪽 위 ··· → 브라우저에서 열기", copyLink: "링크 복사",
    stepEnter: "래플 응모하기 누르기", stepLogin: "가입하거나 로그인하면 응모 완료", stepLoggedIn: "로그인 완료",
    oddsRule: "당첨 확률 ≈ 내 당첨 기회 ÷ 전체 당첨 기회 × 17명", oddsMine: "지금 내 확률 약 {pct} (내 기회 {mine}회 · 전체 {total}회)",
    bonusTitle: "당첨 확률 올리기", bonusOnce: "한 번", bonusLimit: "하루 최대 3회", plusOne: "+1", plusThree: "+3", getShort: "받기", joinShort: "가입",
    bonusPassport: "Fan Passport", bonusCommunity: "커뮤니티 가입", bonusComment: "댓글", bonusAttend: "출석",
    bonusInvite: "친구 초대", bonusInviteRule: "내 링크로 가입·응모한 친구 1명마다(인원 제한 없음)", inviteCta: "초대 링크 공유", invitedFriends: "초대한 친구 {0}명",
    checkIn: "출석하기", findPosts: "댓글 달러 가기", myEntry: "내 응모 1회", myChancesLabel: "내 당첨 기회", chancesCount: "{0}회", optional: "선택",
    prizes: "경품", more: "더 즐기기", done: "완료",
    passportTitle: "Fan Passport", 
    communityTitle: "커뮤니티", 
    share: "친구에게 공유", copied: "링크를 복사했어요", notice: "응모 및 당첨 안내",
    notice1: "응모 기간: 2026년 11월 10일 ~ 12월 13일 23:59 (한국 시간)", notice2: "1인 1응모. 응모만 하면 추첨 대상이에요", notice3: "당첨 기회: 응모 1회 + Fan Passport +1 + 커뮤니티 가입 +1 + 댓글·출석 1회당 +1(각각 하루 3회까지, 한국 날짜 기준)",
    notice9: "친구 초대: 내 링크로 가입한 친구가 응모하면 친구 1명당 당첨 기회 +3(인원 제한 없음, 이벤트 기간 중 새로 가입한 친구만)",
    notice4: "여러 계정·자동화 등 부정 참여는 제외돼요", notice5: "당첨자에게는 가입 이메일로 연락해요", notice6: "기프트카드 지급일과 당첨 발표 일정은 안내 예정", notice7: "개인정보는 당첨 연락·지급에만 사용해요",
    notice8: "Visa 가상 기프트카드로 지급해요. 온라인 결제에 쓸 수 있어요",
    resultCta: "결과 확인", resultTitle: "래플 결과", resultWon: "US${0} 당첨", resultLost: "이번에는 당첨되지 않았어요", resultThanks: "응모해 주셔서 고마워요",
    resultClaim: "가입 이메일로 수령 안내를 보내 드려요", resultClaimCta: "수령 안내 보기",
  },
  en: {
    eventKind: "New member event", period: "Nov 10 – Dec 13", how: "How to enter", required: "Required", ended: "This raffle has ended", kst: "Korea time",
    closesAt: "Ends Dec 13, 23:59", giftCard: "Visa gift card", total: "Total", totalWinners: "17 winners",
    enterCta: "Enter the raffle", entered: "You're in", retry: "Try again",
    flowOnce: "One entry per person",
    inAppGuide: "Open in your browser to enter: tap ··· (top right) → Open in browser", copyLink: "Copy link",
    stepEnter: "Tap Enter the raffle", stepLogin: "Sign up or log in and you're entered", stepLoggedIn: "Logged in",
    oddsRule: "Odds ≈ your chances ÷ all chances × 17 winners", oddsMine: "Your odds now about {pct} (your {mine} of {total} chances)",
    bonusTitle: "Boost your odds", bonusOnce: "Once", bonusLimit: "Up to 3 a day", plusOne: "+1", plusThree: "+3", getShort: "Get", joinShort: "Join",
    bonusPassport: "Fan Passport", bonusCommunity: "Join a community", bonusComment: "Comment", bonusAttend: "Check-in",
    bonusInvite: "Invite friends", bonusInviteRule: "Each friend who signs up and enters with your link (no limit)", inviteCta: "Share invite link", invitedFriends: "Friends invited: {0}",
    checkIn: "Check in", findPosts: "Go comment", myEntry: "Your entries: 1", myChancesLabel: "Your chances", chancesCount: "{0}", optional: "Optional",
    prizes: "Prizes", more: "More to enjoy", done: "Done",
    passportTitle: "Fan Passport", 
    communityTitle: "Community", 
    share: "Share with friends", copied: "Link copied", notice: "Entry and winner info",
    notice1: "Period: Nov 10 to Dec 13, 2026, 23:59 (KST)", notice2: "One entry per person. Entering is all you need to be in the draw", notice3: "Chances: 1 for entering, +1 for a Fan Passport, +1 for joining a community, +1 per comment or check-in (up to 3 each a day, KST date)",
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

export const raffleInviteText = {
  "ko": {
    "title": "친구 초대 · 당첨 기회 +3",
    "rule": "이벤트 기간에 내 링크로 가입하고 응모한 친구 1명마다",
    "copy": "초대 링크 복사",
    "share": "공유",
    "welcome": "친구가 초대했어요. 가입하고 응모하면 친구도 당첨 기회 +3!",
    "stats": "초대로 가입·응모한 친구 {n}명 · 받은 당첨 기회 +{c}회",
    "message": "Visa 기프트카드 래플에 응모하세요! 12월 13일 마감",
    "copied": "링크를 복사했어요"
  },
  "en": {
    "title": "Invite friends · +3 chances",
    "rule": "For each friend who signs up and enters through your link during the event",
    "copy": "Copy invite link",
    "share": "Share",
    "welcome": "A friend invited you! Sign up and enter to give them 3 extra chances.",
    "stats": "Friends who signed up and entered: {n} · Chances earned: +{c}",
    "message": "Enter the Visa gift card raffle by December 13!",
    "copied": "Link copied"
  },
  "ja": {
    "title": "友達を招待 · 当選チャンス +3",
    "rule": "期間中にあなたのリンクから登録して応募した友達1人につき",
    "copy": "招待リンクをコピー",
    "share": "共有",
    "welcome": "友達からの招待です。登録して応募すると友達に当選チャンスが3回追加されます。",
    "stats": "登録・応募した友達 {n}人 · 獲得したチャンス +{c}回",
    "message": "Visaギフトカード抽選は12月13日まで！",
    "copied": "コピーしました"
  },
  "zh-Hans": {
    "title": "邀请好友 · 抽奖机会 +3",
    "rule": "活动期间，每有一位好友通过你的链接注册并报名",
    "copy": "复制邀请链接",
    "share": "分享",
    "welcome": "好友邀请了你！注册并报名即可为好友增加3次抽奖机会。",
    "stats": "已注册并报名的好友 {n} 人 · 已获抽奖机会 +{c} 次",
    "message": "参加 Visa 礼品卡抽奖，12月13日截止！",
    "copied": "链接已复制"
  },
  "zh-Hant": {
    "title": "邀請好友 · 抽獎機會 +3",
    "rule": "活動期間，每有一位好友透過你的連結註冊並報名",
    "copy": "複製邀請連結",
    "share": "分享",
    "welcome": "好友邀請了你！註冊並報名即可為好友增加3次抽獎機會。",
    "stats": "已註冊並報名的好友 {n} 人 · 已獲抽獎機會 +{c} 次",
    "message": "參加 Visa 禮物卡抽獎，12月13日截止！",
    "copied": "已複製連結"
  },
  "es": {
    "title": "Invita a tus amigos · +3 oportunidades",
    "rule": "Por cada amigo que se registre y participe con tu enlace durante el evento",
    "copy": "Copiar enlace de invitación",
    "share": "Compartir",
    "welcome": "¡Te ha invitado un amigo! Regístrate y participa para darle 3 oportunidades más.",
    "stats": "Amigos registrados que participaron: {n} · Oportunidades ganadas: +{c}",
    "message": "¡Participa en el sorteo de tarjetas regalo Visa hasta el 13 de diciembre!",
    "copied": "Enlace copiado"
  },
  "id": {
    "title": "Undang teman · +3 peluang",
    "rule": "Untuk setiap teman yang mendaftar dan ikut undian melalui tautanmu selama acara",
    "copy": "Salin tautan undangan",
    "share": "Bagikan",
    "welcome": "Temanmu mengundangmu! Daftar dan ikut undian agar temanmu mendapat 3 peluang tambahan.",
    "stats": "Teman yang mendaftar dan ikut: {n} · Peluang diperoleh: +{c}",
    "message": "Ikuti undian kartu hadiah Visa hingga 13 Desember!",
    "copied": "Tautan disalin"
  },
  "vi": {
    "title": "Mời bạn bè · +3 cơ hội",
    "rule": "Cho mỗi người bạn đăng ký và tham gia qua liên kết của bạn trong thời gian sự kiện",
    "copy": "Sao chép liên kết mời",
    "share": "Chia sẻ",
    "welcome": "Bạn được một người bạn mời! Đăng ký và tham gia để người ấy nhận thêm 3 cơ hội.",
    "stats": "Bạn đã đăng ký và tham gia: {n} · Cơ hội đã nhận: +{c}",
    "message": "Tham gia bốc thăm thẻ quà tặng Visa đến hết ngày 13 tháng 12!",
    "copied": "Đã sao chép liên kết"
  },
  "th": {
    "title": "ชวนเพื่อน · รับเพิ่ม 3 สิทธิ์",
    "rule": "ต่อเพื่อนหนึ่งคนที่สมัครและเข้าร่วมผ่านลิงก์ของคุณในช่วงกิจกรรม",
    "copy": "คัดลอกลิงก์เชิญ",
    "share": "แชร์",
    "welcome": "เพื่อนชวนคุณมา! สมัครและเข้าร่วมเพื่อให้เพื่อนได้เพิ่ม 3 สิทธิ์",
    "stats": "เพื่อนที่สมัครและเข้าร่วม {n} คน · ได้รับเพิ่ม {c} สิทธิ์",
    "message": "ร่วมลุ้นบัตรของขวัญ Visa ภายใน 13 ธันวาคม!",
    "copied": "คัดลอกลิงก์แล้ว"
  },
  "pt": {
    "title": "Convide amigos · +3 chances",
    "rule": "Por amigo que se cadastrar e participar pelo seu link durante o evento",
    "copy": "Copiar link de convite",
    "share": "Compartilhar",
    "welcome": "Um amigo convidou você! Cadastre-se e participe para dar a ele mais 3 chances.",
    "stats": "Amigos que se cadastraram e participaram: {n} · Chances recebidas: +{c}",
    "message": "Participe do sorteio de cartões-presente Visa até 13 de dezembro!",
    "copied": "Link copiado"
  },
  "fr": {
    "title": "Invitez vos amis · +3 chances",
    "rule": "Pour chaque ami qui s’inscrit et participe via votre lien pendant l’événement",
    "copy": "Copier le lien d’invitation",
    "share": "Partager",
    "welcome": "Un ami vous invite ! Inscrivez-vous et participez pour lui offrir 3 chances de plus.",
    "stats": "Amis inscrits ayant participé : {n} · Chances obtenues : +{c}",
    "message": "Participez au tirage de cartes cadeaux Visa jusqu’au 13 décembre !",
    "copied": "Lien copié"
  },
  "ru": {
    "title": "Пригласите друзей · +3 шанса",
    "rule": "За каждого друга, который зарегистрируется по вашей ссылке и примет участие во время акции",
    "copy": "Скопировать ссылку-приглашение",
    "share": "Поделиться",
    "welcome": "Вас пригласил друг! Зарегистрируйтесь и примите участие, чтобы дать ему ещё 3 шанса.",
    "stats": "Друзей зарегистрировалось и приняло участие: {n} · Получено шансов: +{c}",
    "message": "Участвуйте в розыгрыше подарочных карт Visa до 13 декабря включительно!",
    "copied": "Ссылка скопирована"
  },
  "mn": {
    "title": "Найзаа урих · +3 боломж",
    "rule": "Арга хэмжээний үеэр таны холбоосоор бүртгүүлж сугалаанд оролцсон найз бүрд",
    "copy": "Урилгын холбоос хуулах",
    "share": "Хуваалцах",
    "welcome": "Найз тань таныг урьжээ! Бүртгүүлж сугалаанд оролцвол найз тань 3 нэмэлт боломж авна.",
    "stats": "Бүртгүүлж оролцсон найз: {n} · Авсан боломж: +{c}",
    "message": "12-р сарын 13-ныг дуустал Visa бэлгийн картын сугалаанд оролцоорой!",
    "copied": "Холбоосыг хууллаа"
  }
} satisfies Record<AppLocale, Record<"title" | "rule" | "copy" | "share" | "welcome" | "stats" | "message" | "copied", string>>;
