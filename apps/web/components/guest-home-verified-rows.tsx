import Link from "./fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import type { PhotoSet } from "@/features/media/domain/public-image";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { CreatorImage } from "@/components/fan-ui/creator-image";
import styles from "./guest-home-verified-rows.module.css";

export const verifiedRowLimit = 3;

export type VerifiedRowCreator = {
  celebrity: { slug: string; name: string; image: string | null | undefined; imagePosition?: string; photos?: PhotoSet; isPublic?: boolean };
};

// Verified (passport-holding) creators in the same row form as the "my pages" list. Private creators are listed without a link.
export function VerifiedCreatorRows({ creators, locale, label }: { creators: readonly VerifiedRowCreator[]; locale: AppLocale; label: string }) {
  const rows = creators.slice(0, verifiedRowLimit);
  if (!rows.length) return null;
  return (
    <ul className={styles.list} aria-label={label}>
      {rows.map(({ celebrity }) => {
        const body = <>
          <CreatorImage className={styles.avatar} slug={celebrity.slug} src={celebrity.image} photos={celebrity.photos} position={celebrity.imagePosition} locale={locale} width={36} height={36} sizes="36px" alt="" framed fallback={<span className={`${styles.avatar} ${styles.initial}`} aria-hidden="true">{Array.from(celebrity.name)[0] ?? ""}</span>} />
          <strong>{celebrity.name}</strong>
          {celebrity.isPublic === false ? null : <ChevronRight aria-hidden="true" />}
        </>;
        return <li key={celebrity.slug}>{celebrity.isPublic === false
          ? <div className={styles.row}>{body}</div>
          : <Link className={styles.row} href={`${creatorHomeHref(celebrity.slug)}?locale=${locale}` as Route}>{body}</Link>}</li>;
      })}
    </ul>
  );
}
