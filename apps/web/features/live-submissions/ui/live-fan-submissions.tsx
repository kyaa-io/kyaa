"use client";
import { SongCard } from "./song-card";
import { SongEditor } from "./song-editor";
import type { SongSelection } from "../domain/song";
import { liveSuggestionsCopy } from "@/i18n/catalogs/features__live-submissions__ui";
import { useState } from "react";
import { z } from "zod";
import { usePrivy } from "@privy-io/react-auth";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useFanpageResource } from "@/features/fanpage/ui/use-fanpage-resource";
import { ContentActions, ContentTranslation } from "@/features/content-safety/ui/content-actions";
import { liveSubmissionsPageSchema, liveSubmissionInputSchema, mutationSchema, ownedLiveSubmissionSchema } from "@/features/schedules/domain/participation";
import { ActionFeedback, ParticipationState, useDeadlinePassed, useParticipationAction } from "@/features/schedules/ui/participation-ui";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import styles from "@/features/schedules/ui/participation.module.css";
import songStyles from "./song-card.module.css";
const parse = (value: unknown) => liveSubmissionsPageSchema.parse(value);
export function LiveFanSubmissions(props: { slug: string; celebritySlug: string; locale: AppLocale; browseFirst?: boolean }) {
  const auth = usePrivy();
  return <Submissions key={`${auth.user?.id ?? "guest"}:${props.slug}:${props.locale}`} {...props} />;
}
function Submissions({ slug, celebritySlug, locale, browseFirst = false }: { slug: string; celebritySlug: string; locale: AppLocale; browseFirst?: boolean }) {
  const c = { ...participationCopy(locale), ...liveSuggestionsCopy(locale) }, action = useParticipationAction();
  const [kind, setKind] = useState<"question" | "cheer" | "song">("question"), [body, setBody] = useState("");
  const [song, setSong] = useState<SongSelection | null>(null);
  const [cursor, setCursor] = useState<string | null>(null), [saved, setSaved] = useState(false);
  const url = `/api/live-events/${slug}/submissions?contract=songs-v1&locale=${toContentLocale(locale)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const resource = useFanpageResource(url, parse);
  const data = resource.state.status === "ready" ? resource.state.data : null;
  const closesAt = data?.settings.closesAt;
  const closed = useDeadlinePassed(closesAt);
  const open = data?.settings.accepting && !closed;
  const items = data?.items ?? [];
  const existing = data?.mine.some(item => item.kind === kind);
  const FeedHeading = browseFirst ? "h2" : "h3";
  const feed = <>
      <FeedHeading>{c.all}</FeedHeading>{items.length ? <ul className={styles.list}>{items.map(item => <li key={item.id} className={styles.row}><div className={songStyles.proposalHeader}><div className={songStyles.proposalIdentity}><strong>{item.nickname}</strong><span className={styles.badge}>{c[item.kind]}</span><span className={styles.badge}>{item.status === "selected" ? c.selected : c.submitted}</span></div>
        <ContentActions targetType="live_submission" targetId={item.id} locale={locale} canBlock={!item.isOwner} onChanged={resource.retry} /></div>
        {item.song ? <SongCard song={item.song} locale={locale} /> : <ContentTranslation sourceText={item.body} targetType="live_submission" targetId={item.id} sourceRevision={item.revision} locale={locale}><p>{item.body}</p></ContentTranslation>}
      </li>)}</ul> : <p>{c.empty}</p>}
      <div className={styles.actions}>{cursor && <FanAction onClick={() => setCursor(null)}>{c.firstPage}</FanAction>}{data?.nextCursor && <FanAction onClick={() => setCursor(data?.nextCursor ?? null)}>{c.more}</FanAction>}</div>
  </>;
  return <section className={styles.panel} aria-label={c.heading}>{!browseFirst && <h2>{c.heading}</h2>}
    {!data ? <ParticipationState locale={locale} status={resource.state.status === "error" ? "error" : "loading"} retry={resource.retry} /> : <>
      {browseFirst && feed}
      {browseFirst && <h2>{c.write}</h2>}
      {closesAt && <p className={styles.meta}>{c.deadline}: <time dateTime={closesAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(closesAt))} (KST)</time></p>}
      {!open ? <p>{c.closed}</p> : data.access === "members_required" ? <><p>{c.members}</p><FanAction href={`/c/${celebritySlug}/verify?locale=${locale}`}>{c.verify}</FanAction></> : !action.authenticated ? <FanAction onClick={() => action.login()}>{c.login}</FanAction> : <form className={styles.form} onSubmit={async event => {
        event.preventDefault();
        try {
          const input = { kind, body: kind === "song" ? song?.title ?? "" : body.trim(), song: kind === "song" ? song : null, publicVisible: true };
          const result = await action.run(`/api/live-events/${slug}/submissions?contract=songs-v1`, "POST", liveSubmissionInputSchema.parse({ ...input, idempotencyKey: action.idempotencyKey(input) }), value => mutationSchema(ownedLiveSubmissionSchema).parse(value));
          if (result) { setBody(""); setSong(null); setSaved(true); resource.retry(); }
        } catch { action.setError("INVALID_REQUEST"); }
      }}><fieldset disabled={action.busy || !action.ready}><label>{c.submit}<select value={kind} onChange={event => setKind(event.target.value as "question" | "cheer" | "song")}><option value="question">{c.question}</option><option value="cheer">{c.cheer}</option><option value="song">{c.song}</option></select></label>
        {existing ? <p>{c.mine} · {c.pending}</p> : <>{kind === "song" ? <SongEditor slug={slug} locale={locale} value={song} onChange={setSong} /> : <label>{c[kind]}<textarea rows={3} required maxLength={1000} value={body} onChange={event => setBody(event.target.value)} /></label>}<p id={`public-notice-${slug}`} className={styles.meta}>{c.publicNotice}</p><FanAction type="submit" ariaDescribedBy={`public-notice-${slug}`} disabled={action.busy || (kind === "song" ? !song?.title.trim() || !song?.artist.trim() : !body.trim())}>{c.submit}</FanAction></>}
      </fieldset></form>}
      <ActionFeedback locale={locale} error={action.error} saved={saved} />
      {data.mine.length > 0 && <><h3>{c.mine}</h3><ul className={styles.list}>{data.mine.map(item => <li key={item.id} className={styles.row}><span className={styles.badge}>{item.status === "selected" ? c.selected : item.status === "hidden" ? c.hidden : c.pending}</span>{item.song ? <SongCard song={item.song} locale={locale} /> : item.body && <p>{item.body}</p>}<FanAction disabled={action.busy} onClick={async () => {
        const result = await action.run(`/api/live-submissions/${item.id}?contract=songs-v1`, "DELETE", null, value => z.object({ id: z.string().uuid(), deleted: z.literal(true), replayed: z.boolean() }).parse(value));
        if (result) { setSaved(false); resource.retry(); }
      }}>{c.delete}</FanAction></li>)}</ul></>}
      {!browseFirst && feed}
    </>}
  </section>;
}
