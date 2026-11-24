"use client";

import { EARN } from "../contents";
import { useCallback, useEffect, useState } from "react";
import { Check, LockKeyhole } from "@/components/fan-ui/fan-icons";
import { FanAction } from "@/components/fan-ui/fan-action";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanGauge, FanNumber } from "@/components/fan-ui/fan-number";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import Link from "@/components/fan-ui/hover-prefetch-link";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { getMatchCopy } from "../games/match/copy";
import { entries } from "../contents";
import type { HomeCopy } from "../home";
import { getGrowthCopy } from "./copy";
import { AffinityBadge } from "@/features/chemi/ui/affinity-badge";
import { getRoomLines } from "./room-lines";
import { RoomBackdrop, type Stage } from "./room-backdrop";
import { growthStep } from "./ladder";
import { RoomStage } from "./room-stage";
import styles from "./growth.module.css";

const CHARACTERS = ["changha", "elina", "yuna"] as const;
type Character = (typeof CHARACTERS)[number];
export type Mini = {
  character: Character;
  exp: number;
  level: number;
  album: { slot: number; date: string }[];
  today: string[];
};
export type GrowthState = { minis: Mini[]; full: string[]; fresh: { character: Character; slot: number }[] };

/** 앨범 2~6칸이 열리는 Lv. DB `chemi_grow_unlock` 과 같아야 한다. */
const SLOT_LEVELS = [5, 10, 15, 20, 30];
/** 사진이 준비된 칸 수(Lv 20·30 사진은 다음 제작분). */
const PHOTO_SLOTS = 4;


const stageOf = (level: number): Stage => (level >= 15 ? "star" : level >= 5 ? "kid" : "baby");
const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const sample: GrowthState = {
  fresh: [],
  full: [],
  minis: CHARACTERS.map((character) => ({ character, exp: 0, level: 1, album: [], today: [] })),
};

function StageNotice({ mini, locale, label, account, reveal, celebrate }: {
  mini: Mini; locale: string; label: string; account: string; reveal: (slot: number) => void; celebrate: (key: string) => void;
}) {
  useEffect(() => {
    const key = `chemi-growth-stage:${account}:${mini.character}`;
    try {
      const previous = sessionStorage.getItem(key);
      sessionStorage.setItem(key, String(mini.exp));
      if (previous === null || mini.exp <= Number(previous)) return;
      const before = growthStep(Number(previous), locale);
      const after = growthStep(mini.exp, locale);
      if (before.name === after.name) return;
      const particle = (after.name.charCodeAt(after.name.length - 1) - 0xac00) % 28 === 0 ? "가" : "이";
      showFanToast({ title: fill(getGrowthCopy(locale).promoted, { mini: label, stage: after.name, particle }) });
      celebrate(key + after.name);
      const photo = mini.album.filter(({ slot }) => slot >= 2 && slot <= PHOTO_SLOTS &&
        Number(previous) < 10 * SLOT_LEVELS[slot - 2]! ** 2).sort((a, b) => b.slot - a.slot)[0];
      if (photo) reveal(photo.slot);
    } catch {
      // Session storage can be disabled in private browsing.
    }
  }, [account, mini, locale, label, reveal, celebrate]);
  return null;
}

export function ChemiGrowth({ locale, home, matchAvailable }: { locale: string; home: HomeCopy; matchAvailable: boolean }) {
  const copy = getGrowthCopy(locale);
  const names = getMatchCopy(locale);
  const { ready, authenticated, user, getAccessToken, login } = useByUsAuth();
  const [state, setState] = useState<GrowthState>();
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Character>();
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("character");
    setPicked(CHARACTERS.find(character => character === requested));
  }, []);
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState("");
  const [viewing, setViewing] = useState<number>();

  const call = useCallback(async (character?: Character) => {
    setFailed(false);
    try {
      const response = await fetch("/api/chemi/grow", {
        method: character ? "POST" : "GET",
        headers: { authorization: `Bearer ${await getAccessToken()}`, ...(character ? { "content-type": "application/json" } : {}) },
        body: character ? JSON.stringify({ action: "adopt", character }) : undefined,
      });
      if (!response.ok) throw new Error(String(response.status));
      setState(await response.json());
    } catch {
      setFailed(true);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (ready && authenticated) void call();
  }, [ready, authenticated, call]);

  if (failed)
    return (
      <div data-chemi-hide-dm="">
        <FanState kind="error" title={copy.error} inline actions={<FanAction size="sm" onClick={() => void call()}>{copy.retry}</FanAction>} />
      </div>
    );
  const guest = ready && !authenticated;
  const data = guest ? sample : state;
  if (!data)
    return (
      <div className={styles.grow} data-chemi-hide-dm="" aria-busy="true">
        <FanSkeleton shape="block" width={240} height={36} />
        <FanSkeleton shape="block" className={styles.room} />
        <div className={styles.side}>
          <FanSkeleton shape="block" width="100%" height={72} />
          <FanSkeleton shape="block" width="100%" height={240} />
        </div>
      </div>
    );

  const raised = (mini: Mini) => mini.album.length > 0;
  const fallback = [...data.minis].sort((a, b) => Number(raised(b)) - Number(raised(a)) || b.exp - a.exp)[0];
  const mini = data.minis.find((item) => item.character === picked) ?? fallback;
  const name = names[mini.character];
  const step = growthStep(mini.exp, locale);
  const stage = stageOf(mini.level);
  const next = 10 * (mini.level + 1) ** 2;
  const rows = entries.flatMap(([id, , readingPath]) => {
    if (!(id in EARN)) return [];
    const game = id === "pair" || id === "run";
    const path = game && !matchAvailable ? null : readingPath;
    if (!path) return [];
    const [source, exp] = EARN[id as keyof typeof EARN];
    const got = mini.today.includes(source);
    const href = `${path}?locale=${locale}${id === "tarot" ? `&c=${mini.character}` : ""}`;
    return [{ id, href, exp, got, full: !got && data.full.includes(source), game }];
  });
  const todo = [...rows].sort((a, b) => b.exp - a.exp).find((row) => !row.got && !row.full);
  const adopt = async () => {
    setBusy(true);
    await call(mini.character);
    setBusy(false);
  };
  const primary: { label: string; props: { href: string } | { onClick: () => void; loading?: boolean } } | null = guest
    ? { label: copy.login, props: { onClick: () => login() } }
    : !raised(mini)
      ? { label: fill(copy.adopt, { name }), props: { onClick: () => void adopt(), loading: busy } }
      : todo
        ? { label: fill(todo.game ? copy.play : copy.go, { content: home[todo.id] }), props: { href: todo.href } }
        : null;
  const lines = getRoomLines(locale, mini.character);
  const lineKey = raised(mini) ? (stage === "baby" ? "lineBaby" : stage === "kid" ? "lineKid" : "lineStar") : "lineWait";
  const slotNames = [copy.slot1, copy.kid, "Lv 10", copy.star, "Lv 20", "Lv 30"];
  /** 앨범 칸이 열리는 친밀 Lv. 다음에 열릴 칸에는 그 Lv까지 남은 친밀을 적는다(친밀 Lv L 은 10·L² 부터). */
  const slotLevels = [1, 5, 10, 15, 20, 30];
  const nextSlot = guest ? null : slotLevels.findIndex((level, index) => level > mini.level && !mini.album.some((item) => item.slot === index + 1)) + 1 || null;
  const fresh = new Set(data.fresh.filter((item) => item.character === mini.character).map((item) => item.slot));
  const openDate = viewing ? mini.album.find((item) => item.slot === viewing)?.date : undefined;

  return (
    <div className={styles.grow} data-chemi-hide-dm="">
      <FanTabs
        variant="chip"
        className={styles.chips}
        label={copy.choose}
        current={mini.character}
        items={data.minis.map((item) => ({
          key: item.character,
          onSelect: () => setPicked(item.character),
          label: (
            <span className={styles.chip}>
              <img src={`/chemi/grow/face-${item.character}-v1.webp`} alt="" width={28} height={28} />
              {names[item.character]}
              {raised(item) && <FanText role="meta">Lv {item.level}</FanText>}
            </span>
          ),
        }))}
      />
      <div className={styles.stage}>
        <div className={styles.room}>
          {/* 이번에 어린이(2칸)·스타(4칸) 앨범이 열렸으면 지난 단계 방에서 새 방으로 넘어가는 모습을 한 번 보여 준다. */}
          <RoomBackdrop
            key={`room-${mini.character}-${stage}`}
            character={mini.character}
            stage={stage}
            from={fresh.has(4) ? "kid" : fresh.has(2) ? "baby" : undefined}
          />
          <RoomStage
            key={mini.character}
            character={mini.character}
            stage={stage}
            celebration={celebration}
            locale={locale}
            label={fill(copy.mini, { name })}
            line={lines[lineKey] ?? copy[lineKey]}
          />
          <div className={styles.name}>
            <FanText role="label">{fill(copy.mini, { name })}</FanText>
            <FanTag tone="neutral">{step.chip}</FanTag>
          </div>
          {guest && <FanTag tone="neutral" className={styles.sample}>{copy.sample}</FanTag>}
        </div>
        {primary && <FanAction variant="primary" fullWidth {...primary.props}>{primary.label}</FanAction>}
      </div>
      <div className={styles.side}>
        {!guest && (
          <div className={styles.level}>
            <div className={styles.levelHead}>
              <FanText role="item">{fill(copy.closeness, { name })} Lv</FanText>
              <FanNumber value={mini.level} size="lg" countUp locale={locale} />
              <FanText role="meta" className={styles.exp}>{mini.exp.toLocaleString(locale, { useGrouping: "always" })} / {next.toLocaleString(locale, { useGrouping: "always" })}</FanText>
            </div>
            <FanGauge value={mini.exp} max={next} label={fill(copy.closeness, { name })} />
            <p className={styles.next}>
              <FanText role="meta">{copy.next} · {step.number} / 24</FanText>
              <FanText role="label">{step.nextName} · {fill(copy.toGo, { n: step.remaining.toLocaleString(locale) })}</FanText>
            </p>
          </div>
        )}
        <section>
          <div className={styles.head}><FanHeading>{copy.earn}</FanHeading></div>
          <ul className={styles.earn}>
            {rows.map((row) => (
              <li key={row.id} data-row="">
                <Link href={row.href}>
                  <img src={`/chemi/thumb-${row.id}-128-v2.webp`} alt="" width={40} height={40} />
                  <FanText role="item">{home[row.id]}</FanText>
                  {/* 받을 친밀·받은 표시는 입구 목록과 같은 알약(AffinityBadge)으로 보인다. */}
                  {guest ? null : row.got ? (
                    <span className={styles.gain}>
                      <AffinityBadge size="sm" amount={row.exp} label={`${fill(copy.gain, { n: row.exp })} · ${copy.got}`} doneLabel={copy.got} />
                    </span>
                  ) : row.full ? (
                    <FanText role="meta" className={styles.got}>{copy.full}</FanText>
                  ) : (
                    <span className={styles.gain}>
                      <AffinityBadge size="sm" amount={row.exp} label={fill(copy.gain, { n: row.exp })} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <div className={styles.head}>
            <FanHeading>{copy.album}</FanHeading>
            {!guest && <FanText role="meta">{mini.album.length} / 6</FanText>}
          </div>
          <ol className={styles.album}>
            {slotNames.map((label, index) => {
              const slot = index + 1;
              const got = mini.album.find((item) => item.slot === slot);
              const photo = got && slot <= PHOTO_SLOTS;
              const face = (
                <span className={styles.face}>
                  <span className={styles.photo} data-fresh={fresh.has(slot) || undefined}>
                    {photo ? (
                      <img src={`/chemi/grow/album-${mini.character}-${slot}-v1.webp`} alt="" width={600} height={900} loading="lazy" />
                    ) : (
                      <>
                        {!got && <img
                          className={styles.silhouette}
                          src={`/chemi/grow/mini-${mini.character}-${slot < 2 ? "baby" : slot < 4 ? "kid" : "star"}-v1.webp`}
                          alt=""
                        />}
                        <FanIcon icon={got ? Check : LockKeyhole} size={20} />
                      </>
                    )}
                  </span>
                  <FanText role={got ? "label" : "meta"}>{label}</FanText>
                  {got && <FanText role="meta" className={styles.date}>{got.date.replaceAll("-", ".")}</FanText>}
                  {slot === nextSlot && raised(mini) && (
                    <FanText role="meta" className={styles.toGo}>
                      {fill(copy.toGo, { n: Math.max(0, 10 * slotLevels[index]! ** 2 - mini.exp).toLocaleString(locale) })}
                    </FanText>
                  )}
                </span>
              );
              return (
                <li key={slot} data-row="" data-next={slot === nextSlot && raised(mini) ? "" : undefined}>
                  {photo ? (
                    <FanAction variant="text" className={styles.card} onClick={() => setViewing(slot)}>{face}</FanAction>
                  ) : (
                    <div className={styles.card}>{face}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      {user && <StageNotice key={user.id + mini.character} account={user.id} mini={mini} locale={locale} label={fill(copy.mini, { name })} reveal={setViewing} celebrate={setCelebration} />}
      <FanDialog
        open={viewing !== undefined}
        onOpenChange={(open) => !open && setViewing(undefined)}
        title={viewing ? `${name} · ${slotNames[viewing - 1]}` : ""}
        closeLabel={copy.close}
        size="sm"
      >
        {viewing && (
          <div className={styles.viewer}>
            <img src={`/chemi/grow/album-${mini.character}-${viewing}-v1.webp`} alt="" width={600} height={900} />
            {openDate && <FanText role="meta" className={styles.date}>{openDate.replaceAll("-", ".")}</FanText>}
          </div>
        )}
      </FanDialog>
    </div>
  );
}
