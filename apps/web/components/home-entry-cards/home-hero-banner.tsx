import type { ReactNode } from "react";
import styles from "./home-hero-banner.module.css";

/** The GGGI campaign artwork green (4차 banner art, not a UI color). */
const CAMPAIGN_ART = { "--campaign-art": "#073d33" } as React.CSSProperties;

/** Every homepage slide uses the same image, information and action geometry. */

export function HomeHeroBanner({ image, eyebrow, title, description, action, desktopImage, fullImage, kind = "guide" }: {
  image: ReactNode;
  desktopImage?: ReactNode;
  fullImage?: ReactNode;
  kind?: "live" | "guide" | "welcome" | "campaign" | "art";
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action: ReactNode;
}) {
  return <div className={styles.banner} data-home-hero-banner data-kind={kind} style={kind === "campaign" ? CAMPAIGN_ART : undefined}>
    <div className={styles.image} data-hero-mobile-image>{image}</div>
    {desktopImage ? <div className={styles.desktopImage}>{desktopImage}</div> : null}
    {fullImage ? <div className={styles.fullImage}>{fullImage}</div> : null}
    <div className={styles.overlay} aria-hidden="true" />
    <div className={styles.copy}>
      <div className={styles.eyebrow}>{eyebrow}</div>
      <h2>{title}</h2>
      <div className={styles.description}>{description}</div>
      <div className={styles.action}>{action}</div>
    </div>
  </div>;
}
