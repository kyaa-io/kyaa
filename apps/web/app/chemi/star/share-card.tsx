import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { FanText } from "@/components/fan-ui/fan-text";
import { domainLabels, type StarDomain } from "./copy";
import { art } from "./parts";
import { StarRating } from "./stars";
import styles from "./share-card.module.css";

/**
 * 자랑하기 카드(시안 05-3 share). 그림·제목·별점이 위, 태그·한마디·이름 칸이 아래다.
 * 높이는 내용이 정한다: 모든 줄이 카드 안쪽에 들어가고 잘리는 글자가 없다.
 */
export function StarShareCard({
  character,
  name,
  dateText,
  headline,
  overall,
  sign,
  best,
  bestStar,
  line,
}: {
  character: string;
  name: string;
  dateText: string;
  headline: string;
  overall: number;
  sign: string;
  best: StarDomain;
  bestStar: number;
  line: string;
}) {
  const uiText = useReadingCopy();
  return (
    <div className={styles.card} data-star-share-card="">
      <div className={styles.top}>
        <img className={styles.art} src={`${art}/hero-${character}-p-v1.webp`} alt="" />
        <div className={styles.caption}>
          <FanText as="p" role="meta" className={styles.date}>
            {dateText}
          </FanText>
          <FanText as="p" role="item" className={styles.headline}>
            {headline}
          </FanText>
          <StarRating value={overall} label={uiText("overallStars", { count: overall })} tone="light" />
        </div>
      </div>
      <div className={styles.body}>
        <ul className={styles.tags}>
          <li data-row="star">
            <FanText role="meta">{sign}</FanText>
          </li>
          <li data-row="star">
            <FanText role="meta">
              {domainLabels[best]} ★{bestStar}
            </FanText>
          </li>
        </ul>
        <FanText as="p" role="body" className={styles.quote}>
          “{line}”
        </FanText>
        <div className={styles.foot}>
          <FanText role="label" className={styles.who}>
            {name}
          </FanText>
          <img className={styles.logo} src="/kyaa-app-icon-192.png" alt="kyaa" />
        </div>
      </div>
    </div>
  );
}
