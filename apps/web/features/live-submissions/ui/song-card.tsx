"use client";
import { useState } from "react";
import { Music2 } from "lucide-react";
import type { SongSelection } from "../domain/song";
import type { AppLocale } from "@/i18n/locales";
import { liveSuggestionsCopy } from "@/i18n/catalogs/features__live-submissions__ui";
import styles from "./song-card.module.css";
export function SongCard({ song, locale }: { song: SongSelection; locale: AppLocale }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const c = liveSuggestionsCopy(locale);
  return <div className={styles.card}>
    {song.artworkUrl && song.artworkUrl !== failedUrl ? <img className={styles.artwork} src={song.artworkUrl} alt="" width={72} height={72} onError={() => setFailedUrl(song.artworkUrl)} /> : <span className={`${styles.artwork} ${styles.fallback}`}><Music2 aria-hidden="true" /></span>}
    <div className={styles.details}><strong>{song.title}</strong><p>{song.artist}</p>{song.album && <p>{song.album}</p>}{song.sourceUrl && <a href={song.sourceUrl} target="_blank" rel="noopener noreferrer">{song.provider === "spotify" ? c.spotify : "YouTube"}</a>}</div>
  </div>;
}
