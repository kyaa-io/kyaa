import type { Metadata } from "next";
import Image from "next/image";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import { parseAppLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";
import { EARN, entries } from "../../chemi/contents";
import { copy } from "./copy";
import styles from "./page.module.css";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };

const albumGuide = {
  ko: "케미의 성장 탭에서 미니 최애의 방과 친밀 레벨을 볼 수 있어요. 미니 최애는 방구석 연습생에서 시작해 24단계를 올라요. 데뷔조, 방구석 스타가 되는 날 기념 앨범이 열려요.",
  en: "Open Growth in Chemi to see your Mini Bias’s room and bond level. Your Mini Bias starts as a bedroom trainee and climbs 24 stages. Album photos unlock along the way.",
  mn: "Өсөлт хэсгээс мини одныхоо өрөө болон дотно байдлын түвшнийг хараарай. Мини од гэртээ бэлтгэл хийж эхлээд 24 шатаар ахина. Дебют хийх багт орох болон гэрийн од болох үед дурсгалын цомогт зураг нэмэгдэнэ.",
  ja: "ミニ推しは自宅練習生から始まり、24段階を上がっていくよ。デビュー組やおうちスターになると、記念アルバムに写真が追加されるよ。",
  "zh-Hans": "迷你偶像从居家练习生开始，一共可以成长24个阶段。加入出道组、成为卧室明星时，就能解锁纪念相册里的照片。",
  "zh-Hant": "迷你偶像從居家練習生開始，一共可以成長24個階段。加入出道組、成為臥室明星時，就能解鎖紀念相簿裡的照片。",
  es: "Tu mini empieza ensayando en casa y pasa por 24 etapas. Al entrar en el grupo de debut y al convertirse en estrella en casa, desbloquea fotos para el álbum.",
  pt: "Seu mini começa treinando em casa e passa por 24 etapas. Ao entrar no grupo de estreia e virar estrela em casa, ele desbloqueia fotos no álbum.",
  fr: "Ton mini commence à répéter chez lui et gravit 24 étapes. Des photos s’ajoutent à son album quand il rejoint le groupe de lancement et devient une star à domicile.",
  ru: "Мини-кумир начинает тренироваться дома и проходит 24 этапа. При вступлении в дебютную группу и получении звания домашней звезды в альбоме открываются фотографии.",
  id: "Minimu mulai sebagai trainee rumahan dan melewati 24 tahap. Foto album terbuka saat mini masuk tim debut dan menjadi bintang rumahan.",
  vi: "Mini của bạn bắt đầu là thực tập sinh tại nhà và trải qua 24 giai đoạn. Ảnh kỷ niệm mở khóa khi mini vào đội hình ra mắt và khi trở thành ngôi sao tại gia.",
  th: "มินิของคุณเริ่มจากเด็กฝึกที่บ้านและเติบโตผ่าน 24 ขั้น เมื่อเข้าทีมเดบิวต์และเมื่อได้เป็นดาวประจำบ้าน รูปในอัลบั้มที่ระลึกจะปลดล็อก",
};

const art = {
  fortune: "fortune/fortune-changha-banner-v2.webp",
  saju: "saju/saju-elina-wide-v2.webp",
  zodiac: "star/hero-yuna-l-v1.webp",
  tarot: "hero-01-1440.png",
  pair: "banner-match.webp",
  run: "banner-run.webp",
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale);
  const t = copy[locale];
  const { guide } = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return publicMetadata({ path: "/guide/chemi", locale, title: `${t.title} | kyaa`, description: guide.intro });
}

export default async function ChemiGuidePage({ searchParams }: Props) {
  const locale = parseAppLocale((await searchParams).locale);
  const t = copy[locale];
  const { home: names, guide } = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  return <FanAppFrame locale={locale} currentPath="/guide/chemi" mainId="chemi-guide">
    <FanContentContainer as="main" id="chemi-guide" tabIndex={-1} className={styles.page}>
      <header className={styles.intro}>
        <div className={styles.copy}>
          <FanText role="meta">{t.beta}</FanText>
          <FanHeading as="h1">{t.title}</FanHeading>
          <FanText role="body">{guide.intro}</FanText>
        </div>
        <Image unoptimized className={styles.hero} src="/chemi/chemi-promo-trio.webp" width={1774} height={887} priority alt="" />
      </header>
      {(["readings", "games"] as const).map(group => <section key={group} className={styles.section}>
        <FanHeading>{names[group]}</FanHeading>
        <div className={styles.grid}>
          {entries.filter(([, kind]) => kind === group).map(([key, , href]) => <article className={styles.card} key={key}>
            <div className={styles.art}><Image unoptimized src={`/chemi/${art[key]}`} fill sizes="(min-width: 768px) 25vw, 50vw" alt="" /></div>
            <div className={styles.cardCopy}>
              <FanHeading as="h3"><a href={`${href}?locale=${locale}`}>{names[key]}</a></FanHeading>
              <FanText role="body">{names.descriptions[key]}</FanText>
              <FanText role="meta">{t.affinity} +{EARN[key][1]}</FanText>
            </div>
          </article>)}
        </div>
      </section>)}
      <section className={styles.panel}>
        <FanHeading>{names.mileageGuideTitle}</FanHeading>
        <FanText role="body">{names.gamePricing}</FanText>
        <FanText role="body">{names.datePricing}</FanText>
      </section>
      <section className={styles.growth}>
        <Image unoptimized src="/chemi/grow/room-changha-v2.webp" width={320} height={320} alt="" />
        <div className={styles.copy}>
          <FanHeading>{guide.growth}</FanHeading>
          <FanText role="body">{guide.growthDetail}</FanText>
          <FanText role="body">{albumGuide[locale]}</FanText>
        </div>
      </section>
      <FanAction variant="primary" size="lg" href={`/chemi?locale=${locale}`}>{t.start}</FanAction>
    </FanContentContainer>
  </FanAppFrame>;
}
