import { notFound } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import koCatalog from "@/features/chemi/i18n/locales/ko/chemi.json";
import { mergeMyBirthCopy } from "@/features/chemi/ui/frame/birth-copy";
import { MyBirthScreen, type MyBirthUses } from "@/features/chemi/ui/my-birth/my-birth-screen";
import { parseAppLocale } from "@/i18n/locales";

export const dynamic = "force-dynamic";

export default async function MyBirthPage({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  if (!chemiEnabled()) notFound();
  const locale = parseAppLocale((await searchParams).locale);
  const catalog = (await import(`@/features/chemi/i18n/locales/${locale}/chemi.json`)).default;
  const copy = mergeMyBirthCopy(koCatalog.myBirth, catalog.myBirth);
  const home = { ...koCatalog.home, ...Object.fromEntries(Object.entries(catalog.home).filter(([, text]) => text)) };
  // 이 생일로 계산하는 콘텐츠. 운영 조합도 DEV 와 같게 궁합 상대 목록·별자리 줄을 보인다(11/23 운영 오픈 결정 — 궁합 저장이 열려 있어 지울 곳이 있어야 한다).
  const uses: MyBirthUses = [
    { id: "saju", name: home.saju, href: null, image: "/chemi/my-saju-512.webp" },
    { id: "fortune", name: home.fortune, href: `/chemi/fortune?locale=${locale}`, image: "/chemi/my-fortune-512.webp" },
    { id: "star", name: home.zodiac, href: null, image: "/chemi/my-star-512.webp" },
  ];
  return (
    <FanAppFrame currentPath="/my" locale={locale} mainId="my-birth-main">
      <FanContentContainer as="main" id="my-birth-main" data-chemi-tab="">
        <MyBirthScreen locale={locale} copy={copy} uses={uses} launch={false} />
      </FanContentContainer>
    </FanAppFrame>
  );
}
