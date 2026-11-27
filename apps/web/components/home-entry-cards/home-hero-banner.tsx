import type { ReactNode } from "react";
import styles from "./home-hero-banner.module.css";

/** Every homepage slide uses the same image, information and action geometry. */

export function HomeHeroBanner({ image, imageBadge, eyebrow, eyebrowBadge, title, description, action, desktopImage, fullImage, kind = "guide" }: {
  image: ReactNode;
  imageBadge?: ReactNode;
  desktopImage?: ReactNode;
  fullImage?: ReactNode;
  kind?: "live" | "guide" | "welcome" | "campaign" | "art" | "mission" | "missionbook" | "raffle" | "chemi" | "photo";
  eyebrow: ReactNode;
  /** Beside the eyebrow: the ad banner's reward badge. */
  eyebrowBadge?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action: ReactNode;
}) {
  return <div className={styles.banner} data-home-hero-banner data-kind={kind}>
    <div className={styles.mobileBackdrop} data-hero-backdrop aria-hidden="true">{fullImage ?? image}</div>
    <div className={styles.image} data-hero-mobile-image>{image}{!fullImage && imageBadge}</div>
    {desktopImage ? <div className={styles.desktopImage}>{desktopImage}</div> : null}
    {fullImage ? <div className={styles.fullImage} data-hero-full-image>{fullImage}{imageBadge}</div> : null}
    <div className={styles.overlay} aria-hidden="true" />
    <div className={styles.copy}>
      <div className={styles.eyebrow}>{eyebrow}{eyebrowBadge}</div>
      <h2>{title}</h2>
      <div className={styles.description}>{description}</div>
      <div className={styles.action}>{action}</div>
    </div>
  </div>;
}
