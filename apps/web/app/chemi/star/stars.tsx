import styles from "./stars.module.css";

const path =
  "M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.45 6.2 20.5l1.1-6.47L2.6 9.45l6.5-.95L12 2.6z";

/** 별점 1~5. 색과 모양(채운 별·빈 별)으로 함께 구분하고, 글자 이름을 붙인다. */
export function StarRating({
  value,
  label,
  size = 16,
  tone = "ink",
}: {
  value: number;
  /** 읽어 줄 이름: "애정 별점 5개 중 5개"처럼 부른 쪽에서 정한다. */
  label: string;
  size?: 16 | 20;
  tone?: "ink" | "accent" | "light";
}) {
  return (
    <span
      className={styles.rating}
      data-tone={tone}
      data-size={size}
      role="img"
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" aria-hidden="true" data-on={n <= value || undefined}>
          <path d={path} />
        </svg>
      ))}
    </span>
  );
}
