import Link from "next/link";
import { adminReviewLabels } from "@/i18n/catalogs/components__admin__review-navigation";
import styles from "./operations.module.css";

export function ReviewNavigation({ locale, stamps = false }: { locale: "ko" | "en"; stamps?: boolean }) {
  const labels = adminReviewLabels[locale];
  return (
    <nav className={styles.reviewNavigation} aria-label={labels.certifications}>
      <Link href={{ pathname: "/admin/certifications", query: { lang: locale } }} aria-current={stamps ? undefined : "page"}>
        {labels.missionReview}
      </Link>
      <Link href={{ pathname: "/admin/certifications", query: { lang: locale, view: "stamps" } }} aria-current={stamps ? "page" : undefined}>
        {labels.stampReview}
      </Link>
    </nav>
  );
}
