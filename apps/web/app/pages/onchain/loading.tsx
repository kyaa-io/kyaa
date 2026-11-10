import { FanContentContainer } from "@/components/fan-shell/fan-content-container";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import styles from "@/components/onchain/onchain-public-page.module.css";

export default function Loading() {
  return (
    <main className={styles.page} aria-busy="true">
      <section className={styles.hero}>
        <FanContentContainer>
          <p className={styles.eyebrow}>PUBLIC ONCHAIN RECORDS</p>
          <h1>kyaa onchain records</h1>
          <FanSkeletonStatus locale="ko" label="GIWA Sepolia의 최신 확정 스냅샷을 불러오는 중입니다. / Loading the latest finalized GIWA Sepolia snapshot…" />
          <FanSkeleton width="70%" height={16} />
        </FanContentContainer>
      </section>
    </main>
  );
}
