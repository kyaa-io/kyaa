import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText } from "@/features/chemi/i18n/reading-ui";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import styles from "./scene.module.css";

/** 만 14세 미만은 생일을 저장하지 않는다. */
export function Under14({ locale }: { locale: string }) {
  const uiText = useReadingCopy();
  return (
    <div className={styles.under}>
      <FanText as="p" role="body">
        <ReadingText id="age" />
      </FanText>
      <FanAction variant="primary" href={`/chemi?locale=${locale}`}>
        {uiText("chemiBack")}</FanAction>
    </div>
  );
}
