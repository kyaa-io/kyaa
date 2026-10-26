import type { AppLocale } from "@/i18n/locales";

const rows: Record<AppLocale, readonly [string, string, string, string, string, string, string]> = {
  ko: ["최애 멤버를 선택해 주세요", "선택한 멤버의 화이트·파스텔 포토카드 2장을 받아요. 받은 후에는 멤버를 바꿀 수 없어요.", "포토카드 2장 받기", "서로 다른 분위기의 포토카드 3장을 랜덤으로 받아요. 받은 구성은 다시 뽑을 수 없어요.", "랜덤 포토카드 3장 받기", "포토카드를 받고 있어요", "수령 결과를 확인하지 못했어요. 다시 확인해 주세요."],
  en: ["Choose your favorite member", "Receive 2 photocards of your chosen member, one in white and one in pastel colors. You cannot change your choice after claiming.", "Claim 2 photocards", "Receive a random set of 3 photocards with different looks. Your set cannot be redrawn.", "Claim 3 random photocards", "Claiming your photocards", "We couldn’t confirm your claim. Please check again."],
  ja: ["推しメンバーを選んでください", "選んだメンバーのホワイト・パステルのフォトカードを2枚受け取れます。受け取り後はメンバーを変更できません。", "フォトカードを2枚受け取る", "雰囲気の異なるフォトカード3枚をランダムで受け取れます。引き直しはできません。", "ランダムフォトカードを3枚受け取る", "フォトカードを受け取り中", "受け取り結果を確認できませんでした。もう一度確認してください。"],
  "zh-Hans": ["请选择你最喜欢的成员", "领取所选成员的白色和粉彩风格小卡，共2张。领取后无法更换成员。", "领取2张小卡", "随机领取一组3张不同风格的小卡，领取后无法重新抽取。", "领取3张随机小卡", "正在领取小卡", "无法确认领取结果，请重新查看。"],
  "zh-Hant": ["請選擇你最喜歡的成員", "領取所選成員的白色和粉彩風格小卡，共2張。領取後無法更換成員。", "領取2張小卡", "隨機領取一組3張不同風格的小卡，領取後無法重新抽取。", "領取3張隨機小卡", "正在領取小卡", "無法確認領取結果，請重新查看。"],
  es: ["Elige a tu integrante favorito", "Recibe sus 2 photocards, una de blanco y otra en tonos pastel. No podrás cambiar de integrante después.", "Recibir 2 photocards", "Recibe un conjunto aleatorio de 3 photocards con estilos diferentes. No podrás volver a sortearlo.", "Recibir 3 photocards al azar", "Recibiendo tus photocards", "No pudimos confirmar la entrega. Vuelve a comprobarlo."],
  id: ["Pilih anggota favoritmu", "Dapatkan 2 photocard anggota pilihanmu dengan gaya putih dan pastel. Anggota tidak dapat diganti setelah diklaim.", "Klaim 2 photocard", "Dapatkan satu set acak berisi 3 photocard dengan nuansa berbeda. Set tidak dapat diundi ulang.", "Klaim 3 photocard acak", "Sedang mengklaim photocard", "Hasil klaim belum dapat dikonfirmasi. Silakan periksa lagi."],
  vi: ["Chọn thành viên bạn yêu thích", "Nhận 2 photocard của thành viên đã chọn: một phong cách trắng và một pastel. Bạn không thể đổi thành viên sau khi nhận.", "Nhận 2 photocard", "Nhận ngẫu nhiên một bộ 3 photocard với phong cách khác nhau. Không thể bốc lại bộ ảnh.", "Nhận 3 photocard ngẫu nhiên", "Đang nhận photocard", "Chưa thể xác nhận kết quả nhận. Vui lòng kiểm tra lại."],
  th: ["เลือกสมาชิกที่คุณชื่นชอบ", "รับโฟโต้การ์ดของสมาชิกที่เลือก 2 ใบในลุคสีขาวและพาสเทล เมื่อรับแล้วจะเปลี่ยนสมาชิกไม่ได้", "รับโฟโต้การ์ด 2 ใบ", "รับโฟโต้การ์ดแบบสุ่ม 1 ชุด จำนวน 3 ใบที่มีบรรยากาศแตกต่างกัน ไม่สามารถสุ่มใหม่ได้", "รับโฟโต้การ์ดสุ่ม 3 ใบ", "กำลังรับโฟโต้การ์ด", "ยังยืนยันผลการรับไม่ได้ โปรดตรวจสอบอีกครั้ง"],
  pt: ["Escolha seu integrante favorito", "Receba 2 photocards do integrante escolhido, nos estilos branco e pastel. Não será possível trocar de integrante depois.", "Receber 2 photocards", "Receba um conjunto aleatório de 3 photocards com estilos diferentes. Não será possível sortear novamente.", "Receber 3 photocards aleatórios", "Recebendo seus photocards", "Não foi possível confirmar o recebimento. Verifique novamente."],
  fr: ["Choisissez votre membre préféré", "Recevez ses 2 photocards, une en blanc et une en tons pastel. Vous ne pourrez plus changer de membre après réception.", "Recevoir 2 photocards", "Recevez un lot aléatoire de 3 photocards aux ambiances différentes. Il ne sera pas possible de refaire le tirage.", "Recevoir 3 photocards au hasard", "Réception de vos photocards", "Impossible de confirmer la réception. Veuillez vérifier à nouveau."],
  ru: ["Выберите своего любимого участника", "Получите 2 фотокарточки с выбранным вами участником, одну белую и одну пастельных тонов. После получения карточки изменить свой выбор будет невозможно.", "Получите 2 фотокарточки", "Получите случайный набор из 3 фотокарточек с разными образами. Ваш набор не будет перевыбран.", "Получите 3 случайные фотокарточки", "Получение ваших фотокарточек", "Мы не смогли подтвердить ваше утверждение. Пожалуйста, проверьте еще раз."],

};

export function photocardClaimCopy(locale: AppLocale) {
  const [choose, memberHint, claimPair, randomHint, claimRandom, claiming, failed] = rows[locale];
  return { choose, memberHint, claimPair, randomHint, claimRandom, claiming, failed };
}
