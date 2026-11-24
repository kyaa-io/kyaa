const thresholds = [0, 20, 60, 130, 250, 400, 650, 1000, 1400, 1800, 2250, 3000, 4000, 5000, 6200, 7500, 9000, 10600, 12300, 14100, 16000, 18000, 20000, 22000];
const korean = ["방구석 연습생", "기초반 연습생", "심화반 연습생", "데뷔 후보", "데뷔조", "데뷔 쇼케이스", "신인", "첫 음악방송", "기대주", "신인상", "방구석 스타", "음악방송 1위", "첫 팬미팅", "단독 콘서트", "앵콜 콘서트", "전국 투어", "아시아 투어", "월드 투어", "스타디움 공연", "올해의 가수", "톱스타", "슈퍼스타", "레전드", "명예의 전당"];
const chips = ["연습생", "기초반", "심화반", "데뷔 후보", "데뷔조", "쇼케이스", "신인", "첫 방송", "기대주", "신인상", "스타", "1위", "팬미팅", "콘서트", "앵콜", "전국 투어", "아시아 투어", "월드 투어", "스타디움", "올해의 가수", "톱스타", "슈퍼스타", "레전드", "전당"];
const english = ["Bedroom trainee", "Basics class", "Advanced class", "Debut candidate", "Debut team", "Debut showcase", "Rookie", "First music show", "One to watch", "Rookie award", "Bedroom star", "First win", "First fan meeting", "Solo concert", "Encore concert", "National tour", "Asia tour", "World tour", "Stadium show", "Artist of the year", "Top star", "Superstar", "Legend", "Hall of fame"];

const translations: Record<string, readonly string[]> = { ko: korean, en: english,
  "mn": ["Гэрийн дадлагажигч", "Суурь анги", "Ахисан анги", "Дебютийн нэр дэвшигч", "Дебютийн баг", "Дебютийн шоукейс", "Шинэ од", "Анхны хөгжмийн шоу", "Ирээдүйтэй од", "Шинэ одын шагнал", "Гэрийн од", "Хөгжмийн шоуны 1-р байр", "Анхны фэн уулзалт", "Бие даасан концерт", "Анкор концерт", "Улс даяарх аялал", "Азийн аялал", "Дэлхийн аялал", "Цэнгэлдэх хүрээлэнгийн тоглолт", "Оны шилдэг дуучин", "Топ од", "Супер од", "Домог", "Алдрын танхим"],
  "ja": ["自宅練習生", "基礎クラス", "上級クラス", "デビュー候補", "デビュー組", "ショーケース", "新人", "初の音楽番組", "期待の星", "新人賞", "おうちスター", "音楽番組1位", "初ファンミ", "単独公演", "アンコール公演", "全国ツアー", "アジアツアー", "世界ツアー", "スタジアム公演", "年間最優秀歌手", "トップスター", "スーパースター", "レジェンド", "殿堂入り"],
  "zh-Hans": ["居家练习生", "基础班", "进阶班", "出道候选", "出道组", "出道展示会", "新人", "首次音乐节目", "新秀", "新人奖", "卧室明星", "音乐节目冠军", "首次粉丝见面会", "个人演唱会", "安可演唱会", "全国巡演", "亚洲巡演", "世界巡演", "体育场演出", "年度歌手", "顶级明星", "超级巨星", "传奇", "名人堂"],
  "zh-Hant": ["居家練習生", "基礎班", "進階班", "出道候選", "出道組", "出道發表會", "新人", "首次音樂節目", "新秀", "新人獎", "臥室明星", "音樂節目冠軍", "首次粉絲見面會", "個人演唱會", "安可演唱會", "全國巡演", "亞洲巡演", "世界巡演", "體育場演出", "年度歌手", "頂級明星", "超級巨星", "傳奇", "名人堂"],
  "es": ["Aprendiz en casa", "Clase básica", "Clase avanzada", "Aspirante al debut", "Grupo de debut", "Showcase de debut", "Debutante", "Primer programa musical", "Gran promesa", "Premio revelación", "Estrella en casa", "Primer número uno", "Primer encuentro con fans", "Concierto en solitario", "Concierto de bis", "Gira nacional", "Gira asiática", "Gira mundial", "Show en estadio", "Artista del año", "Gran estrella", "Superestrella", "Leyenda", "Salón de la fama"],
  "fr": ["Apprenti à la maison", "Cours débutant", "Cours avancé", "Candidat aux débuts", "Équipe de lancement", "Showcase de lancement", "Nouvel artiste", "Première émission musicale", "Espoir à suivre", "Prix révélation", "Star à domicile", "Premier numéro un", "Première rencontre avec les fans", "Concert solo", "Concert de rappel", "Tournée nationale", "Tournée asiatique", "Tournée mondiale", "Concert au stade", "Artiste de l’année", "Grande star", "Superstar", "Légende", "Panthéon"],
  "pt": ["Aprendiz em casa", "Turma básica", "Turma avançada", "Candidato à estreia", "Grupo de estreia", "Show de estreia", "Estreante", "Primeiro programa musical", "Grande promessa", "Prêmio revelação", "Estrela em casa", "Primeiro lugar", "Primeiro encontro com fãs", "Show solo", "Show de bis", "Turnê nacional", "Turnê asiática", "Turnê mundial", "Show em estádio", "Artista do ano", "Grande estrela", "Superestrela", "Lenda", "Hall da fama"],
  "id": ["Trainee rumahan", "Kelas dasar", "Kelas lanjutan", "Kandidat debut", "Tim debut", "Showcase debut", "Pendatang baru", "Acara musik pertama", "Bintang harapan", "Penghargaan pendatang baru", "Bintang rumahan", "Juara acara musik", "Jumpa penggemar pertama", "Konser solo", "Konser encore", "Tur nasional", "Tur Asia", "Tur dunia", "Konser stadion", "Artis tahun ini", "Bintang papan atas", "Superstar", "Legenda", "Hall of Fame"],
  "vi": ["Thực tập sinh tại nhà", "Lớp cơ bản", "Lớp nâng cao", "Ứng viên ra mắt", "Đội hình ra mắt", "Showcase ra mắt", "Tân binh", "Sân khấu âm nhạc đầu tiên", "Ngôi sao triển vọng", "Giải tân binh", "Ngôi sao tại gia", "Hạng nhất âm nhạc", "Buổi gặp fan đầu tiên", "Concert riêng", "Concert encore", "Lưu diễn toàn quốc", "Lưu diễn châu Á", "Lưu diễn thế giới", "Diễn ở sân vận động", "Ca sĩ của năm", "Ngôi sao hàng đầu", "Siêu sao", "Huyền thoại", "Đại sảnh danh vọng"],
  "th": ["เด็กฝึกที่บ้าน", "คลาสพื้นฐาน", "คลาสขั้นสูง", "ผู้เข้าชิงเดบิวต์", "ทีมเดบิวต์", "โชว์เคสเดบิวต์", "ศิลปินหน้าใหม่", "รายการเพลงครั้งแรก", "ดาวรุ่ง", "รางวัลหน้าใหม่", "ดาวประจำบ้าน", "อันดับหนึ่งรายการเพลง", "แฟนมีตครั้งแรก", "คอนเสิร์ตเดี่ยว", "คอนเสิร์ตอังกอร์", "ทัวร์ทั่วประเทศ", "ทัวร์เอเชีย", "เวิลด์ทัวร์", "โชว์ในสนามกีฬา", "ศิลปินแห่งปี", "ดาวแถวหน้า", "ซูเปอร์สตาร์", "ตำนาน", "หอเกียรติยศ"],
  "ru": ["Стажёр дома", "Базовый класс", "Продвинутый класс", "Кандидат на дебют", "Дебютная группа", "Дебютный шоукейс", "Новичок", "Первое музыкальное шоу", "Восходящая звезда", "Премия за дебют", "Домашняя звезда", "Первое место", "Первая встреча с фанатами", "Сольный концерт", "Концерт на бис", "Тур по стране", "Тур по Азии", "Мировой тур", "Концерт на стадионе", "Артист года", "Топ-звезда", "Суперзвезда", "Легенда", "Зал славы"],
};

export function growthStep(exp: number, locale: string) {
  const names = translations[locale] ?? english;
  const last = thresholds.length - 1;
  const next = thresholds.findIndex(value => value > exp);
  const index = next === -1 ? last : Math.max(0, next - 1);
  const stars = Math.max(0, Math.floor((exp - thresholds[last]!) / 2000));
  const suffix = stars ? ` ★${stars.toLocaleString(locale)}` : "";
  return {
    number: index + 1,
    chip: (locale === "ko" ? chips[index] : names[index]) + suffix,
    name: names[index] + suffix,
    nextName: next === -1 ? `${names[last]} ★${(stars + 1).toLocaleString(locale)}` : names[next],
    remaining: (next === -1 ? thresholds[last]! + (stars + 1) * 2000 : thresholds[next]!) - exp,
  };
}
