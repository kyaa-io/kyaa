import { FanHeading } from "@/components/fan-ui/fan-heading";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import { guideText } from "./guide-copy";
import { GuideCta } from "./guide-live";
import styles from "./dukjil-story.module.css";

const copy: Record<AppLocale, readonly [string, string, string, string, string]> = {
  ko: ["좋아하는 마음을 함께 나눠요", "팬페이지에서 소식을 확인하고 사진과 영상을 만나보세요.", "게시글과 댓글로 다른 팬들과 이야기를 나눠요.", "출석과 덕질로 팬 활동을 기록해요.", "LIVE와 혜택을 살펴보고 참여 조건을 확인해요."],
  en: ["Share what you love", "Find news, photos and videos on fan pages.", "Talk with other fans through posts and comments.", "Record your activity with check-ins and missions.", "Explore LIVE events and benefits and check their conditions."],
  ja: ["好きな気持ちを分かち合おう", "ファンページでニュースや写真、動画をチェック。", "投稿やコメントでファンと交流。", "出席やミッションで活動を記録。", "LIVEと特典を見て参加条件を確認。"],
  "zh-Hans": ["分享你的喜爱", "在粉丝主页查看资讯、照片和视频。", "通过帖子和评论与粉丝交流。", "用签到和任务记录粉丝活动。", "浏览 LIVE 和福利并确认参与条件。"],
  "zh-Hant": ["分享你的喜愛", "在粉絲頁查看消息、照片和影片。", "透過貼文和留言與粉絲交流。", "用簽到和任務記錄粉絲活動。", "瀏覽 LIVE 和福利並確認參加條件。"],
  es: ["Comparte lo que te gusta", "Descubre noticias, fotos y vídeos en las páginas de fans.", "Habla con otros fans en publicaciones y comentarios.", "Registra tu actividad con visitas y misiones.", "Explora LIVE y beneficios y consulta sus condiciones."],
  id: ["Bagikan kesukaanmu", "Temukan kabar, foto, dan video di halaman penggemar.", "Berbincang dengan penggemar lain lewat postingan dan komentar.", "Catat aktivitas melalui check-in dan misi.", "Jelajahi LIVE dan manfaat, lalu periksa syaratnya."],
  vi: ["Chia sẻ điều bạn yêu thích", "Xem tin tức, ảnh và video trên trang người hâm mộ.", "Trò chuyện với người hâm mộ qua bài viết và bình luận.", "Ghi lại hoạt động bằng điểm danh và nhiệm vụ.", "Khám phá LIVE và quyền lợi, rồi xem điều kiện tham gia."],
  th: ["แบ่งปันสิ่งที่คุณชื่นชอบ", "ดูข่าว รูปภาพ และวิดีโอในหน้าแฟน", "พูดคุยกับแฟนคนอื่นผ่านโพสต์และความคิดเห็น", "บันทึกกิจกรรมด้วยการเช็กชื่อและภารกิจ", "ดู LIVE และสิทธิประโยชน์ พร้อมตรวจสอบเงื่อนไข"],
  pt: ["Compartilhe o que você ama", "Veja notícias, fotos e vídeos nas páginas de fãs.", "Converse com outros fãs em publicações e comentários.", "Registre sua atividade com check-ins e missões.", "Explore LIVE e benefícios e confira as condições."],
  fr: ["Partagez ce que vous aimez", "Découvrez les actualités, photos et vidéos sur les pages de fans.", "Échangez avec les fans dans les publications et commentaires.", "Gardez une trace de vos activités avec les présences et missions.", "Découvrez les LIVE et avantages et leurs conditions."],
  ru: ["Делитесь тем, что любите", "Смотрите новости, фото и видео на страницах фанатов.", "Общайтесь с фанатами в публикациях и комментариях.", "Отмечайте активность с помощью посещений и заданий.", "Изучайте LIVE и преимущества и проверяйте условия."],
};

export function DukjilStory({ locale }: { locale: AppLocale }) {
  const text = copy[locale];
  const titles = [guideText(locale, "dkgCtaFans"), guideText(locale, "dkgActPost"), guideText(locale, "dkgActCheckin"), guideText(locale, "dkgActLiveAttend")];
  return <section className={styles.story} aria-labelledby="dukjil-guide-title">
    <div className={styles.intro}><FanHeading as="h1" id="dukjil-guide-title">{guideText(locale, "dkgDkMetaTitle")}</FanHeading><p>{text[0]}</p></div>
    <img className={styles.hero} src="/images/guide/dukjil-hero.webp" width={1254} height={1254} alt="" />
    <ol className={styles.steps}>{titles.map((title, i) => <li key={title} data-row="guide-step"><span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><div><FanHeading>{title}</FanHeading><p>{text[i + 1]}</p></div></li>)}</ol>
    <div className={styles.actions}><GuideCta locale={locale} target="fan-page" returnPath="/guide/dukjil" /><Link href={`/guide/jjinfan?locale=${locale}` as Route}>{guideText(locale, "dkgLinkJjinfan")}</Link></div>
  </section>;
}
