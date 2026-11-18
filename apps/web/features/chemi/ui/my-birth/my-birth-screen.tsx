"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import Link from "@/components/fan-ui/hover-prefetch-link";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { ChevronLeft, Droplet, Flame, Gem, Mountain, Sprout } from "@/components/fan-ui/fan-icons";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import { FanText } from "@/components/fan-ui/fan-text";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import {
  birthIsoToText, birthRequest, birthTextToIso, draftFromBirth, sameDraft, timeFromApi, timeToApi, type BirthDraft, type BirthTime,
} from "@/features/chemi/domain/birth-form";
import { chemiProfileResponseSchema, type ChemiBirthMark, type ChemiProfileResponse } from "@/features/chemi/domain/contracts/profile";
import type { AppLocale } from "@/i18n/locales";
import { fillCopy, type MyBirthCopy } from "../frame/birth-copy";
import { timeLabel } from "../frame/birth-fields";
import { BirthSheet, type BirthSheetMode } from "./birth-sheet";
import { ConsentDialog, PartnerWipeDialog, WipeDialog } from "./birth-dialogs";
import { BirthLoginGate } from "./birth-login-gate";
import { PartnerSheet, type Partner, type PartnerDraft } from "./partner-sheet";
import styles from "./my-birth.module.css";

export type MyBirthUses = readonly { id: "saju" | "fortune" | "star"; name: string; href: string | null; image: string }[];

const parseProfile = (value: unknown) => chemiProfileResponseSchema.parse(value);
const MARK_ICONS = { wood: Sprout, fire: Flame, earth: Mountain, metal: Gem, water: Droplet } as const;
const kstParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: pick("year"), month: Number(pick("month")), day: Number(pick("day")), text: `${pick("year")}.${pick("month")}.${pick("day")}` };
};

type Overlay = { kind: "birth"; mode: BirthSheetMode } | { kind: "partner"; id: string | null } | { kind: "wipe" } | { kind: "partner-wipe"; id: string } | null;
type FlashKey = "date" | "time" | "gender" | "place" | "saju" | "fortune";

/**
 * MY › 내 생일 정보(시안 11-2 7차). 내 정보 카드(생일 표지·고치기 또는 30일 잠금) · 궁합 상대 · 동의 · 모두 지우기와 '쓰는 곳' 레일.
 * `launch`(운영 조합)는 궁합 상대 카드와 별자리 운세를 두지 않고, 지우기 확인에서 남는 것을 보이지 않는다.
 */
export function MyBirthScreen({ locale, copy, uses, launch }: Readonly<{ locale: AppLocale; copy: MyBirthCopy; uses: MyBirthUses; launch: boolean }>) {
  const router = useRouter();
  const auth = useByUsAuth();
  const { state, retry } = useOwnedFanResource("/api/chemi/profile", parseProfile, auth);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<ReadonlySet<FlashKey>>(new Set());

  // 저장 직후 값 강조는 다음 조작(누름·키)이나 화면을 떠날 때 끈다. 움직임 줄이기에서는 움직임 없이 색만 켜 둔다(CSS).
  useEffect(() => {
    if (flash.size === 0) return;
    const clear = () => setFlash(new Set());
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((type) => addEventListener(type, clear, true));
    return () => events.forEach((type) => removeEventListener(type, clear, true));
  }, [flash]);

  const request = useCallback(async (method: string, url: string, body?: unknown) => {
    const token = await auth.getAccessToken();
    return fetch(url, {
      method, cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  }, [auth]);

  const goBack = () => { if (window.history.length > 1) router.back(); else router.push(`/my?locale=${locale}`); };
  const header = <div className={styles.pagehead}>
    <FanIconButton className={styles.back} aria-label={copy.back} onClick={goBack}><FanIcon icon={ChevronLeft} /></FanIconButton>
    <FanHeading as="h1">{copy.title}</FanHeading>
  </div>;

  if (state.status === "error" && state.kind === "auth") {
    return <div className={styles.screen}>{header}<BirthLoginGate locale={locale} copy={copy} /></div>;
  }
  if (state.status === "loading") return <div className={styles.screen}>{header}<BirthSkeleton locale={locale} copy={copy} uses={uses} launch={launch} /></div>;
  if (state.status === "error") {
    return <div className={styles.screen}>{header}
      <FanSurface as="section" className={styles.card} aria-labelledby="my-birth-me">
        <div className={styles.sechead}><FanHeading id="my-birth-me">{copy.meTitle}</FanHeading></div>
        <div className={styles.cardState} role="alert"><FanText as="p" role="meta">{copy.loadFail}</FanText><FanAction variant="neutral" size="sm" onClick={retry}>{copy.retry}</FanAction></div>
      </FanSurface>
    </div>;
  }

  const profile: ChemiProfileResponse = state.data;
  const { birth, partners, summary } = profile;
  const locked = birth?.editableFrom ? kstParts(birth.editableFrom) : null;
  const calendarName = (calendar: Partner["calendar"]) => ({ solar: copy.solar, lunar: copy.lunar, lunar_leap: copy.lunarLeap })[calendar];
  const genderName = (gender: Partner["gender"]) => (gender === "female" ? copy.female : gender === "male" ? copy.male : null);
  const flashed = (key: FlashKey, node: ReactNode) => flash.has(key) ? <span data-flash="">{node}</span> : <span>{node}</span>;

  const saveBirth = async (draft: BirthDraft) => {
    const previous = birth ? draftFromBirth(birth) : null;
    const response = await request("PUT", "/api/chemi/profile/birth", birthRequest(draft)).catch(() => null);
    if (!response?.ok) { showFanToast({ title: copy.saveFailed, tone: "error" }); return false; }
    if (previous) {
      const changed = new Set<FlashKey>();
      if (previous.dateText !== draft.dateText || previous.calendar !== draft.calendar) changed.add("date");
      if (JSON.stringify(previous.time) !== JSON.stringify(draft.time)) changed.add("time");
      if (previous.gender !== draft.gender) changed.add("gender");
      if (previous.place !== draft.place) changed.add("place");
      if (changed.size) { changed.add("saju"); changed.add("fortune"); }
      setFlash(changed);
      if (!sameDraft(previous, draft)) showFanToast({ title: copy.savedToast, tone: "success" });
    }
    retry();
    return true;
  };
  const savePartner = (id: string | null) => async (draft: PartnerDraft) => {
    const body = { nickname: draft.nickname, birthDate: birthTextToIso(draft.dateText) as string, calendar: draft.calendar, ...timeToApi(draft.time), gender: draft.gender };
    const response = await (id
      ? request("PATCH", "/api/chemi/partners", { partnerId: id, ...body })
      : request("POST", "/api/chemi/partners", { ...body, source: "saju" })).catch(() => null);
    if (!response?.ok) { showFanToast({ title: copy.saveFailed, tone: "error" }); return false; }
    retry();
    return true;
  };
  const wipe = async (method: "DELETE", url: string, body: unknown, done: string, after: () => void) => {
    setBusy(true);
    const response = await request(method, url, body).catch(() => null);
    setBusy(false);
    if (!response?.ok) { showFanToast({ title: copy.deleteFailed, tone: "error" }); return; }
    setOverlay(null);
    showFanToast({ title: done, tone: "success" });
    after();
    retry();
  };

  const mark = profile.birthMark;
  const editing = overlay?.kind === "partner" ? partners.find((partner) => partner.id === overlay.id) ?? null : null;
  const partnerDraft = (partner: Partner): PartnerDraft => ({
    nickname: partner.nickname, dateText: birthIsoToText(partner.birthDate), calendar: partner.calendar, time: timeFromApi(partner.birthTime, partner.timePrecision), gender: partner.gender,
  });
  const timeText = (time: BirthTime) => timeLabel(time, copy);

  const meValue = (key: "date" | "time" | "gender" | "place", value: string | null, fillable = false) => <div>
    <FanText as="dt" role="meta">{{ date: copy.fieldDate, time: copy.fieldTime, gender: copy.fieldGender, place: copy.fieldPlace }[key]}</FanText>
    <FanText as="dd" role={value ? "item" : "body"} className={value ? undefined : styles.none}>
      {value ? flashed(key, value) : <>{copy.none}{fillable ? <FanAction variant="text" size="sm" className={styles.fillAction} ariaLabel={fillCopy(copy.fillAria, { field: key === "time" ? copy.fieldTime : copy.fieldPlace })} onClick={() => setOverlay({ kind: "birth", mode: "fill" })}>{copy.fill}</FanAction> : null}</>}
    </FanText>
  </div>;

  const meCard = <FanSurface as="section" className={`${styles.card} ${styles.me}`} aria-labelledby="my-birth-me">
    <div className={styles.sechead}>
      <FanHeading id="my-birth-me">{copy.meTitle}</FanHeading>
      {mark ? <BirthMark mark={mark} copy={copy} /> : null}
      {!birth ? <FanAction variant="primary" size="sm" className={styles.push} onClick={() => setOverlay({ kind: "birth", mode: "first" })}>{copy.enter}</FanAction>
        : locked ? <FanText role="meta" className={styles.push}>{fillCopy(copy.lock, { date: fillCopy(copy.monthDay, { month: locked.month, day: locked.day }) })}</FanText>
        : <FanAction variant="neutral" size="sm" className={styles.push} onClick={() => setOverlay({ kind: "birth", mode: "edit" })}>{copy.edit}</FanAction>}
    </div>
    <dl className={styles.facts}>
      {meValue("date", birth ? `${birthIsoToText(birth.birthDate)} · ${calendarName(birth.calendar)}` : null)}
      {meValue("time", birth ? timeText(timeFromApi(birth.birthTime, birth.timePrecision)) : null, Boolean(locked))}
      {meValue("gender", birth ? (genderName(birth.gender) ?? copy.noGender) : null)}
      {meValue("place", birth?.birthPlace ?? null, Boolean(locked))}
    </dl>
  </FanSurface>;

  const partnerCard = !launch && birth ? <FanSurface as="section" className={`${styles.card} ${styles.partners}`} aria-labelledby="my-birth-partners">
    <div className={styles.sechead}>
      <FanHeading id="my-birth-partners">{copy.partnersTitle}</FanHeading>
      {partners.length ? <FanText role="meta" className={styles.push}>{partners.length}/{profile.partnerLimit}</FanText> : null}
    </div>
    <ul className={styles.people}>
      {partners.map((partner) => {
        const metas = [`${birthIsoToText(partner.birthDate)}${partner.calendar === "solar" ? "" : ` ${calendarName(partner.calendar)}`}`, timeText(timeFromApi(partner.birthTime, partner.timePrecision)) ?? copy.timeUnknown, genderName(partner.gender)].filter(Boolean);
        return <li key={partner.id} data-row="">
          <span className={styles.who}><FanText as="strong" role="item">{partner.nickname}</FanText><FanText role="meta" className={styles.meta}>{metas.map((meta) => <span key={meta}>{meta}</span>)}</FanText></span>
          <span className={styles.acts}>
            <FanAction variant="text" ariaLabel={fillCopy(copy.partnerEditAria, { name: partner.nickname })} onClick={() => setOverlay({ kind: "partner", id: partner.id })}>{copy.partnerEdit}</FanAction>
            <FanAction variant="text" className={`${styles.quiet} ${styles.flushEnd}`} ariaLabel={fillCopy(copy.partnerDeleteAria, { name: partner.nickname })} onClick={() => setOverlay({ kind: "partner-wipe", id: partner.id })}>{copy.partnerDelete}</FanAction>
          </span>
        </li>;
      })}
      {partners.length === 0 ? <li className={styles.solo} data-row=""><FanAction variant="text" className={styles.flushStart} onClick={() => setOverlay({ kind: "partner", id: null })}>{copy.partnerNew}</FanAction></li> : null}
    </ul>
  </FanSurface> : null;

  const consentCard = birth && profile.consent ? <FanSurface as="section" className={`${styles.card} ${styles.agreed}`} aria-labelledby="my-birth-consent">
    <div className={styles.sechead}>
      <FanHeading id="my-birth-consent">{copy.consentTitle}</FanHeading>
      <FanText role="meta" className={styles.push}>{fillCopy(copy.consentDate, { date: kstParts(profile.consent.at).text })}</FanText>
    </div>
    <div className={styles.consent}><FanText role="body">{copy.consentItem}</FanText><FanAction variant="text" className={styles.flushEnd} onClick={() => setConsentOpen(true)}>{copy.consentView}</FanAction></div>
  </FanSurface> : null;

  const status = (id: "saju" | "fortune" | "star") => {
    if (!birth) return null;
    if (id === "saju") return flash.has("saju") ? copy.useSajuFresh : summary.sajuReading ? copy.useSajuReady : null;
    if (id === "fortune") return flash.has("fortune") ? copy.useFortuneFresh : summary.fortuneToday ? copy.useTodayReady : null;
    return summary.starToday ? copy.useTodayReady : null;
  };
  const usesRail = <aside className={styles.uses} aria-labelledby="my-birth-uses">
    <div className={styles.sechead}><FanHeading id="my-birth-uses">{copy.usesTitle}</FanHeading></div>
    <div className={styles.tiles}>
      {uses.map((use) => {
        const value = status(use.id);
        const content = <>
          <img className={styles.pic} src={use.image} alt="" width={512} height={512} loading="lazy" decoding="async" />
          <span className={styles.tilebody}><FanText as="strong" role="item">{use.name}</FanText>{value ? <FanText as="div" role="meta">{flash.has(use.id as FlashKey) ? <span data-flash="">{value}</span> : value}</FanText> : null}</span>
        </>;
        return use.href ? <Link key={use.id} className={styles.tile} href={use.href as Route}>{content}</Link> : <div key={use.id} className={styles.tile}>{content}</div>;
      })}
    </div>
  </aside>;

  return <div className={styles.screen}>
    {header}
    <div className={styles.columns}>
      <div className={styles.maincol}>
        {meCard}
        {partnerCard}
        {consentCard}
        {birth ? <FanAction variant="text" className={`${styles.wipeButton} ${styles.flushStart}`} onClick={() => setOverlay({ kind: "wipe" })}>{copy.wipe}</FanAction> : null}
      </div>
      {usesRail}
    </div>
    {overlay?.kind === "birth" ? <BirthSheet key={overlay.mode} mode={overlay.mode} initial={birth ? draftFromBirth(birth) : null} copy={copy} onSave={saveBirth} onClose={() => setOverlay(null)} onOpenConsent={() => setConsentOpen(true)} /> : null}
    {overlay?.kind === "partner" && (overlay.id === null || editing) ? <PartnerSheet key={overlay.id ?? "new"} initial={editing ? partnerDraft(editing) : null} copy={copy} onSave={savePartner(overlay.id)} onDelete={() => setOverlay({ kind: "partner-wipe", id: overlay.id as string })} onClose={() => setOverlay(null)} /> : null}
    {overlay?.kind === "wipe" ? <WipeDialog copy={copy} summary={summary} launch={launch} busy={busy} onConfirm={() => wipe("DELETE", "/api/chemi/profile/birth", undefined, copy.deletedToast, () => setFlash(new Set()))} onClose={() => setOverlay(null)} /> : null}
    {overlay?.kind === "partner-wipe" ? <PartnerWipeDialog copy={copy} name={partners.find((partner) => partner.id === overlay.id)?.nickname ?? ""} busy={busy} onConfirm={() => wipe("DELETE", "/api/chemi/partners", { partnerId: overlay.id }, copy.partnerDeletedToast, () => undefined)} onClose={() => setOverlay(null)} /> : null}
    {consentOpen ? <ConsentDialog copy={copy} onClose={() => setConsentOpen(false)} /> : null}
  </div>;
}

/** 생일의 해와 그 해 천간의 오행: 을해년 · 돼지띠. 설명 문장 없이 핑크 틴트 알약 하나. */
function BirthMark({ mark, copy }: Readonly<{ mark: NonNullable<ChemiBirthMark>; copy: MyBirthCopy }>) {
  return <span className={styles.birthmark} data-element={mark.element}>
    <FanIcon icon={MARK_ICONS[mark.element]} size={20} />
    <FanText role="label">{fillCopy(copy.birthMark, { ganji: `${mark.stem}${mark.branch}`, animal: mark.animal })}</FanText>
  </span>;
}

/** 읽는 동안: 실제와 같은 칸·높이의 핑크 틴트 막대(FanSkeleton). */
function BirthSkeleton({ locale, copy, uses, launch }: Readonly<{ locale: AppLocale; copy: MyBirthCopy; uses: MyBirthUses; launch: boolean }>) {
  return <div className={styles.columns} aria-busy="true">
    <FanSkeletonStatus locale={locale} />
    <div className={styles.maincol}>
      <FanSurface as="section" className={styles.card}>
        <div className={styles.sechead}><FanHeading>{copy.meTitle}</FanHeading><FanSkeleton shape="block" width={72} height={36} className={styles.push} /></div>
        <dl className={styles.facts}>{[0, 1, 2, 3].map((index) => <div key={index}><dt><FanSkeleton width={64} height={16} /></dt><dd><FanSkeleton width={104} height={24} /></dd></div>)}</dl>
      </FanSurface>
      {launch ? null : <FanSurface as="section" className={`${styles.card} ${styles.partners}`}>
        <div className={styles.sechead}><FanHeading>{copy.partnersTitle}</FanHeading></div>
        <ul className={styles.people}>{[0, 1].map((index) => <li key={index} data-row=""><span className={styles.who}><FanSkeleton width={56} height={24} /><FanSkeleton width={176} height={18} /></span></li>)}</ul>
      </FanSurface>}
      <FanSurface as="section" className={`${styles.card} ${styles.agreed}`}>
        <div className={styles.sechead}><FanHeading>{copy.consentTitle}</FanHeading></div>
        <div className={styles.consent}><FanSkeleton width={200} height={20} /></div>
      </FanSurface>
    </div>
    <aside className={styles.uses}>
      <div className={styles.sechead}><FanHeading>{copy.usesTitle}</FanHeading></div>
      <div className={styles.tiles}>{uses.map((use) => <div key={use.id} className={styles.tile}><FanSkeleton shape="block" className={styles.pic} /><span className={styles.tilebody}><FanSkeleton width={80} height={22} /><FanSkeleton width={96} height={18} /></span></div>)}</div>
    </aside>
  </div>;
}
