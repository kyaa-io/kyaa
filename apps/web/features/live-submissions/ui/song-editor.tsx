"use client";
import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useFanpageResource } from "@/features/fanpage/ui/use-fanpage-resource";
import { ParticipationState } from "@/features/schedules/ui/participation-ui";
import { songSearchResponseSchema, type SongSelection } from "../domain/song";
import { liveSuggestionsCopy } from "@/i18n/catalogs/features__live-submissions__ui";
import type { AppLocale } from "@/i18n/locales";
import { SongCard } from "./song-card";
import styles from "./song-card.module.css";
import formStyles from "@/features/schedules/ui/participation.module.css";
const parse = (value: unknown) => songSearchResponseSchema.parse(value);
export function SongEditor({ slug, locale, value, onChange }: { slug: string; locale: AppLocale; value: SongSelection | null; onChange: (value: SongSelection | null) => void }) {
  const c = liveSuggestionsCopy(locale);
  const [manual, setManual] = useState(false), [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const canSearch = query.trim().length >= 2 && query.trim().length <= 120;
  const resource = useFanpageResource(search && !manual ? `/api/music/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(search)}` : null, parse);
  if (value?.provider === "spotify") return <><SongCard song={value} locale={locale} /><FanAction onClick={() => onChange(null)}>{c.change}</FanAction></>;
  return <><div className={formStyles.tabs}><button type="button" aria-pressed={!manual} onClick={() => { setManual(false); onChange(null); }}>{c.search}</button> <button type="button" aria-pressed={manual} onClick={() => { setManual(true); onChange(null); }}>{c.manual}</button></div>
    {manual ? <>{(["title", "artist", "sourceUrl"] as const).map(field => <label key={field}>{field === "sourceUrl" ? c.youtube : c[field]}<input type={field === "sourceUrl" ? "url" : "text"} required={field !== "sourceUrl"} maxLength={field === "sourceUrl" ? 2048 : 200} value={value?.[field] ?? ""} onChange={event => onChange({ provider: "manual", trackId: null, title: "", artist: "", album: null, artworkUrl: null, sourceUrl: null, ...value, [field]: event.target.value || (field === "sourceUrl" ? null : "") })} /></label>)}</> : <><label>{c.query}<input value={query} maxLength={120} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (canSearch) { setSearch(query.trim()); resource.retry(); } } }} /></label><FanAction disabled={!canSearch} onClick={() => { setSearch(query.trim()); resource.retry(); }}>{c.search}</FanAction>
      {search && (resource.state.status !== "ready" ? <ParticipationState locale={locale} status={resource.state.status} retry={resource.retry} /> : resource.state.data.items.length ? <ul className={styles.results}>{resource.state.data.items.map(song => <li className={styles.result} key={song.trackId}><SongCard song={song} locale={locale} /><FanAction onClick={() => onChange(song)}>{c.select} · {song.title}</FanAction></li>)}</ul> : <p role="status">{c.noResults}</p>)}</>}
  </>;
}
