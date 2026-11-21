"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LockKeyhole } from "@/components/fan-ui/fan-icons";
import { FanAction } from "@/components/fan-ui/fan-action";
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
import styles from "./growth.module.css";

const CHARACTERS = ["changha", "elina", "yuna"] as const;
type Character = (typeof CHARACTERS)[number];
type Stage = "baby" | "kid" | "star";
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
/** 콘텐츠가 주는 친밀 EXP 와 기록 이름. DB `chemi_complete_reading`·`chemi_match_finish`·`chemi_run_finish` 와 같아야 한다. */
const EARN = { fortune: ["fortune", 10], saju: ["saju", 20], zodiac: ["star", 10], tarot: ["tarot", 10], pair: ["match", 10], run: ["run", 10] } as const;

const stageOf = (level: number): Stage => (level >= 15 ? "star" : level >= 5 ? "kid" : "baby");
const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const sample: GrowthState = {
  fresh: [],
  full: [],
  minis: CHARACTERS.map((character) => ({ character, exp: 0, level: 1, album: [], today: [] })),
};

export function ChemiGrowth({ locale, home, matchAvailable }: { locale: string; home: HomeCopy; matchAvailable: boolean }) {
  const copy = getGrowthCopy(locale);
  const names = getMatchCopy(locale);
  const { ready, authenticated, getAccessToken, login } = useByUsAuth();
  const [state, setState] = useState<GrowthState>();
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Character>();
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("character");
    setPicked(CHARACTERS.find(character => character === requested));
  }, []);
  const [busy, setBusy] = useState(false);
  const [hop, setHop] = useState(false);
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
  const slotNames = [copy.slot1, copy.kid, "Lv 10", copy.star, "Lv 20", "Lv 30"];
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
          <img src={`/chemi/grow/room-${mini.character}-v1.webp`} alt="" width={1024} height={1024} />
          <FanAction
            key={`${mini.character}-${stage}`}
            variant="text"
            className={styles.mini}
            ariaLabel={fill(copy.mini, { name })}
            onClick={() => setHop(true)}
          >
            <img
              src={`/chemi/grow/mini-${mini.character}-${stage}-v1.webp`}
              alt=""
              width={400}
              height={580}
              data-hop={hop}
              onAnimationEnd={() => setHop(false)}
            />
          </FanAction>
          <div className={styles.name}>
            <FanText role="label">{fill(copy.mini, { name })}</FanText>
            <FanTag tone="neutral">{copy[stage]}</FanTag>
          </div>
          {guest && <FanTag tone="neutral" className={styles.sample}>{copy.sample}</FanTag>}
          <FanText as="p" role="meta" className={styles.line}>{raised(mini) ? copy[stage === "baby" ? "lineBaby" : stage === "kid" ? "lineKid" : "lineStar"] : copy.lineWait}</FanText>
        </div>
        {primary && <FanAction variant="primary" fullWidth {...primary.props}>{primary.label}</FanAction>}
      </div>
      <div className={styles.side}>
        {!guest && (
          <div className={styles.level}>
            <div className={styles.levelHead}>
              <FanText role="item">{fill(copy.closeness, { name })} Lv</FanText>
              <FanNumber value={mini.level} size="lg" countUp locale={locale} />
              <FanText role="meta" className={styles.exp}>{mini.exp.toLocaleString(locale)} / {next.toLocaleString(locale)}</FanText>
            </div>
            <FanGauge value={mini.exp} max={next} label={fill(copy.closeness, { name })} />
            {stage !== "star" && (
              <p className={styles.next}>
                <FanText role="meta">{copy.next}</FanText>
                <FanText role="label">{stage === "baby" ? `${copy.kid} Lv 5` : `${copy.star} Lv 15`}</FanText>
              </p>
            )}
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
                  {guest ? null : row.got ? (
                    <FanText role="meta" className={styles.got}><FanIcon icon={Check} size={16} />{copy.got}</FanText>
                  ) : row.full ? (
                    <FanText role="meta" className={styles.got}>{copy.full}</FanText>
                  ) : (
                    <FanText role="meta" className={styles.gain}>{fill(copy.gain, { n: row.exp })}</FanText>
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
                </span>
              );
              return (
                <li key={slot} data-row="">
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
