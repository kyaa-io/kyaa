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
    "headline": "친구 1명 초대할 때마다 당첨 기회 +3",
    "rule": "이벤트 기간에 내 링크로 새로 가입하고 응모한 친구만 해당돼요",
    "cta": "친구 초대하기",
    "copy": "초대 링크 복사",
    "copied": "링크를 복사했어요",
    "empty": "아직 초대로 응모한 친구가 없어요",
    "progress": "{n}명 참여 · 당첨 기회 +{c}회",
    "invitedBy": "{name}님이 초대했어요",
    "invitedByBody": "가입하고 응모하면 {name}님이 당첨 기회 +3을 받아요",
    "invitedFriend": "친구가 초대했어요",
    "invitedFriendBody": "가입하고 응모하면 초대한 친구가 당첨 기회 +3을 받아요",
    "message": "Visa 기프트카드 래플에 응모하세요! 12월 13일 마감"
  },
  "en": {
    "headline": "+3 chances for every friend you invite",
    "rule": "Counts friends who sign up through your link and enter during the event",
    "cta": "Invite friends",
    "copy": "Copy invite link",
    "copied": "Link copied",
    "empty": "No friends have entered through your link yet",
    "progress": "{n} joined · +{c} chances",
    "invitedBy": "{name} invited you",
    "invitedByBody": "Sign up and enter, and {name} gets 3 extra chances",
    "invitedFriend": "A friend invited you",
    "invitedFriendBody": "Sign up and enter, and your friend gets 3 extra chances",
    "message": "Enter the Visa gift card raffle by December 13!"
  },
  "ja": {
    "headline": "友達を1人招待するごとに当選チャンス +3",
    "rule": "期間中にあなたのリンクから新規登録して応募した友達が対象です",
    "cta": "友達を招待する",
    "copy": "招待リンクをコピー",
    "copied": "コピーしました",
    "empty": "招待から応募した友達はまだいません",
    "progress": "{n}人が参加 · 当選チャンス +{c}回",
    "invitedBy": "{name}さんからの招待です",
    "invitedByBody": "登録して応募すると、{name}さんに当選チャンスが3回追加されます",
    "invitedFriend": "友達からの招待です",
    "invitedFriendBody": "登録して応募すると、招待した友達に当選チャンスが3回追加されます",
    "message": "Visaギフトカード抽選は12月13日まで！"
  },
  "zh-Hans": {
    "headline": "每邀请 1 位好友，抽奖机会 +3",
    "rule": "仅计算活动期间通过你的链接新注册并报名的好友",
    "cta": "邀请好友",
    "copy": "复制邀请链接",
    "copied": "链接已复制",
    "empty": "还没有好友通过邀请报名",
    "progress": "{n} 人参与 · 抽奖机会 +{c} 次",
    "invitedBy": "{name} 邀请了你",
    "invitedByBody": "注册并报名后，{name} 将获得 3 次额外抽奖机会",
    "invitedFriend": "好友邀请了你",
    "invitedFriendBody": "注册并报名后，邀请你的好友将获得 3 次额外抽奖机会",
    "message": "参加 Visa 礼品卡抽奖，12月13日截止！"
  },
  "zh-Hant": {
    "headline": "每邀請 1 位好友，抽獎機會 +3",
    "rule": "僅計算活動期間透過你的連結新註冊並報名的好友",
    "cta": "邀請好友",
    "copy": "複製邀請連結",
    "copied": "已複製連結",
    "empty": "還沒有好友透過邀請報名",
    "progress": "{n} 人參與 · 抽獎機會 +{c} 次",
    "invitedBy": "{name} 邀請了你",
    "invitedByBody": "註冊並報名後，{name} 將獲得 3 次額外抽獎機會",
    "invitedFriend": "好友邀請了你",
    "invitedFriendBody": "註冊並報名後，邀請你的好友將獲得 3 次額外抽獎機會",
    "message": "參加 Visa 禮物卡抽獎，12月13日截止！"
  },
  "es": {
    "headline": "+3 oportunidades por cada amigo que invites",
    "rule": "Cuentan los amigos que se registren con tu enlace y participen durante el evento",
    "cta": "Invitar amigos",
    "copy": "Copiar enlace de invitación",
    "copied": "Enlace copiado",
    "empty": "Aún no ha participado ningún amigo con tu enlace",
    "progress": "{n} participaron · +{c} oportunidades",
    "invitedBy": "{name} te ha invitado",
    "invitedByBody": "Regístrate y participa para que {name} reciba 3 oportunidades más",
    "invitedFriend": "Te ha invitado un amigo",
    "invitedFriendBody": "Regístrate y participa para que tu amigo reciba 3 oportunidades más",
    "message": "¡Participa en el sorteo de tarjetas regalo Visa hasta el 13 de diciembre!"
  },
  "id": {
    "headline": "+3 peluang untuk setiap teman yang kamu undang",
    "rule": "Dihitung teman yang mendaftar lewat tautanmu dan ikut selama acara",
    "cta": "Undang teman",
    "copy": "Salin tautan undangan",
    "copied": "Tautan disalin",
    "empty": "Belum ada teman yang ikut lewat tautanmu",
    "progress": "{n} ikut · +{c} peluang",
    "invitedBy": "{name} mengundangmu",
    "invitedByBody": "Daftar dan ikut agar {name} mendapat 3 peluang tambahan",
    "invitedFriend": "Temanmu mengundangmu",
    "invitedFriendBody": "Daftar dan ikut agar temanmu mendapat 3 peluang tambahan",
    "message": "Ikuti undian kartu hadiah Visa hingga 13 Desember!"
  },
  "vi": {
    "headline": "+3 cơ hội cho mỗi người bạn bạn mời",
    "rule": "Chỉ tính bạn bè đăng ký mới qua liên kết của bạn và tham gia trong thời gian sự kiện",
    "cta": "Mời bạn bè",
    "copy": "Sao chép liên kết mời",
    "copied": "Đã sao chép liên kết",
    "empty": "Chưa có người bạn nào tham gia qua liên kết của bạn",
    "progress": "{n} người tham gia · +{c} cơ hội",
    "invitedBy": "{name} đã mời bạn",
    "invitedByBody": "Đăng ký và tham gia để {name} nhận thêm 3 cơ hội",
    "invitedFriend": "Một người bạn đã mời bạn",
    "invitedFriendBody": "Đăng ký và tham gia để người bạn đã mời nhận thêm 3 cơ hội",
    "message": "Tham gia bốc thăm thẻ quà tặng Visa đến hết ngày 13 tháng 12!"
  },
  "th": {
    "headline": "ชวนเพื่อน 1 คน รับเพิ่ม 3 สิทธิ์",
    "rule": "นับเฉพาะเพื่อนที่สมัครใหม่ผ่านลิงก์ของคุณและเข้าร่วมในช่วงกิจกรรม",
    "cta": "ชวนเพื่อน",
    "copy": "คัดลอกลิงก์เชิญ",
    "copied": "คัดลอกลิงก์แล้ว",
    "empty": "ยังไม่มีเพื่อนที่เข้าร่วมผ่านลิงก์ของคุณ",
    "progress": "เข้าร่วม {n} คน · รับเพิ่ม {c} สิทธิ์",
    "invitedBy": "{name} ชวนคุณมา",
    "invitedByBody": "สมัครและเข้าร่วม แล้ว {name} จะได้รับเพิ่ม 3 สิทธิ์",
    "invitedFriend": "เพื่อนชวนคุณมา",
    "invitedFriendBody": "สมัครและเข้าร่วม แล้วเพื่อนที่ชวนจะได้รับเพิ่ม 3 สิทธิ์",
    "message": "ร่วมลุ้นบัตรของขวัญ Visa ภายใน 13 ธันวาคม!"
  },
  "pt": {
    "headline": "+3 chances para cada amigo que você convidar",
    "rule": "Contam os amigos que se cadastrarem pelo seu link e participarem durante o evento",
    "cta": "Convidar amigos",
    "copy": "Copiar link de convite",
    "copied": "Link copiado",
    "empty": "Nenhum amigo participou pelo seu link ainda",
    "progress": "{n} participaram · +{c} chances",
    "invitedBy": "{name} convidou você",
    "invitedByBody": "Cadastre-se e participe para {name} ganhar mais 3 chances",
    "invitedFriend": "Um amigo convidou você",
    "invitedFriendBody": "Cadastre-se e participe para seu amigo ganhar mais 3 chances",
    "message": "Participe do sorteio de cartões-presente Visa até 13 de dezembro!"
  },
  "fr": {
    "headline": "+3 chances pour chaque ami invité",
    "rule": "Seuls comptent les amis qui s’inscrivent via votre lien et participent pendant l’événement",
    "cta": "Inviter des amis",
    "copy": "Copier le lien d’invitation",
    "copied": "Lien copié",
    "empty": "Aucun ami n’a encore participé via votre lien",
    "progress": "{n} participants · +{c} chances",
    "invitedBy": "{name} vous invite",
    "invitedByBody": "Inscrivez-vous et participez : {name} gagne 3 chances de plus",
    "invitedFriend": "Un ami vous invite",
    "invitedFriendBody": "Inscrivez-vous et participez : votre ami gagne 3 chances de plus",
    "message": "Participez au tirage de cartes cadeaux Visa jusqu’au 13 décembre !"
  },
  "ru": {
    "headline": "+3 шанса за каждого приглашённого друга",
    "rule": "Учитываются друзья, которые зарегистрировались по вашей ссылке и приняли участие во время акции",
    "cta": "Пригласить друзей",
    "copy": "Скопировать ссылку-приглашение",
    "copied": "Ссылка скопирована",
    "empty": "По вашей ссылке пока никто не участвует",
    "progress": "Участвуют: {n} · +{c} шансов",
    "invitedBy": "{name} приглашает вас",
    "invitedByBody": "Зарегистрируйтесь и примите участие, и {name} получит ещё 3 шанса",
    "invitedFriend": "Вас пригласил друг",
    "invitedFriendBody": "Зарегистрируйтесь и примите участие, и ваш друг получит ещё 3 шанса",
    "message": "Участвуйте в розыгрыше подарочных карт Visa до 13 декабря включительно!"
  },
  "mn": {
    "headline": "Найз бүрээ урихад +3 боломж",
    "rule": "Арга хэмжээний үеэр таны холбоосоор шинээр бүртгүүлж оролцсон найзыг тооцно",
    "cta": "Найзаа урих",
    "copy": "Урилгын холбоос хуулах",
    "copied": "Холбоосыг хууллаа",
    "empty": "Таны холбоосоор оролцсон найз одоогоор алга",
    "progress": "{n} оролцсон · +{c} боломж",
    "invitedBy": "{name} таныг урьсан",
    "invitedByBody": "Бүртгүүлж оролцвол {name} 3 нэмэлт боломж авна",
    "invitedFriend": "Найз тань таныг урьсан",
    "invitedFriendBody": "Бүртгүүлж оролцвол урьсан найз тань 3 нэмэлт боломж авна",
    "message": "12-р сарын 13-ныг дуустал Visa бэлгийн картын сугалаанд оролцоорой!"
  }
} satisfies Record<AppLocale, Record<"headline" | "rule" | "cta" | "copy" | "copied" | "empty" | "progress" | "invitedBy" | "invitedByBody" | "invitedFriend" | "invitedFriendBody" | "message", string>>;
