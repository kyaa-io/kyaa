import styles from "./song-card.module.css";
export function LivePlatformMark({ provider, label = false }: { provider: string; label?: boolean }) {
  const key = provider.toLowerCase();
  const asset = key === "tiktok" || key === "youtube" || key === "instagram" ? `${key}.svg` : key === "chzzk" ? "chzzk.png" : null;
  const name = key === "tiktok" ? "TikTok" : key === "youtube" ? "YouTube" : key === "instagram" ? "Instagram" : key === "chzzk" ? "CHZZK" : provider;
  return <span className={styles.platform}>{asset && <img src={`/images/guest-home/${asset}`} alt={label ? "" : name} width={20} height={20} />}{(label || !asset) && name}</span>;
}
