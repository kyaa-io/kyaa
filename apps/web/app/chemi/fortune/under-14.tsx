import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import styles from "./scene.module.css";

/** 만 14세 미만은 생일을 저장하지 않는다. */
export function Under14({ locale }: { locale: string }) {
  return (
    <div className={styles.under}>
      <FanText as="p" role="body">
        만 14세 이상부터 이용할 수 있어요
      </FanText>
      <FanAction variant="primary" href={`/chemi?locale=${locale}`}>
        케미로 돌아가기
      </FanAction>
    </div>
  );
}
