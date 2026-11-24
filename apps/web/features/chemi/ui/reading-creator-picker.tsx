import { ReadingText } from "@/features/chemi/i18n/reading-ui";
import styles from "./reading-creator-picker.module.css";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { creatorName } from "@/features/fanpage/domain/creator-names";
import type { AppLocale } from "@/i18n/locales";

const creators = ["changha", "elina", "yuna"] as const;

export function needsCreatorChoice(params: { c?: string; r?: string; step?: string }) {
  if (params.r && params.step && params.step !== "enter") return false;
  return !creators.some((creator) => creator === params.c);
}

export function ReadingCreatorPicker({ content, locale, onChoose }: {
  content: "fortune" | "saju" | "star" | "tarot" | "tarot/spread";
  locale: AppLocale;
  onChoose?: (creator: (typeof creators)[number]) => void;
}) {
  return (
    <section className={styles.picker}>
      <FanHeading as="h1"><ReadingText id="favorite" /></FanHeading>
      {creators.map((creator) => (
        <FanAction key={creator} variant="neutral" {...(onChoose ? { onClick: () => onChoose(creator) } : { href: `/chemi/${content}?locale=${locale}&c=${creator}` })}>
          <img src={`/chemi/grow/face-${creator}-v1.webp`} width={40} height={40} alt="" />
          {creatorName(creator, locale)}
        </FanAction>
      ))}
    </section>
  );
}
