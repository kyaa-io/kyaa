"use client";

import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeletonRows, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanText } from "@/components/fan-ui/fan-text";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { ReadingText, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import type { MyBirthCopy } from "@/features/chemi/ui/frame/birth-copy";
import type { AppLocale } from "@/i18n/locales";
import { BirthSheet, type SheetResult } from "../../saju/birth-sheet";
import { loadProfile, savePartner, type Partner } from "../../saju/reading";
import { starCharacters, type StarCharacterId } from "../copy";
import { Toolbar } from "../parts";
import { matchCopy } from "./copy";
import styles from "./match.module.css";

type Connection = { mine: string; theirs: string; angle: number };
type Match = { name: string; connections: Connection[] };
type Failure = "dailyLimit" | "partnerFailure";

const SOFT = [0, 60, 120];
const TARGETS = ["Venus", "Moon", "Mercury"];

/** 저장된 옛 궁합은 각도 거리만 있다. 달은 시각을 알 수 없어 빼고 주요 각만 다시 고른다. */
function legacyConnections(angles: { self: string; partner: string; degrees: number }[]) {
  return angles
    .filter((row) => row.self !== "Moon" && row.partner !== "Moon")
    .flatMap((row) =>
      [0, 60, 90, 120, 180]
        .filter((angle) => Math.abs(angle - row.degrees) <= 6)
        .map((angle) => ({ mine: row.self, theirs: row.partner, angle, error: Math.abs(angle - row.degrees) })),
    )
    .sort((a, b) => a.error - b.error);
}

/** 네 가지(끌림·편안함·대화·부딪칠 때)마다 닿은 각의 수. 앞의 셋은 부드러운 각, 마지막은 사각·충. */
export function matchWays(connections: Connection[]) {
  return [0, 1, 2, 3].map((index) =>
    connections.filter((row) =>
      index === 3
        ? row.angle === 90 || row.angle === 180
        : (row.mine === TARGETS[index] || row.theirs === TARGETS[index]) && SOFT.includes(row.angle),
    ).length,
  );
}

export function MatchScreen({
  locale,
  character,
  birthCopy,
}: {
  locale: AppLocale;
  character: StarCharacterId;
  birthCopy: MyBirthCopy;
}) {
  const text = useReadingCopy();
  const copy = matchCopy(locale);
  const { ready, authenticated, getAccessToken, login } = useByUsAuth();
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [reload, setReload] = useState(0);
  const name = starCharacters.find((item) => item.id === character)!.name;
  const back = `/chemi/star?locale=${locale}&c=${character}`;

  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    void getAccessToken()
      .then((token) => loadProfile(token, controller.signal))
      .then((profile) => {
        if (controller.signal.aborted) return;
        setPartners(profile.partners);
        setChosen((current) => current ?? profile.partners[0]?.id ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("partnerFailure");
      });
    return () => controller.abort();
  }, [authenticated, getAccessToken, reload]);

  async function compare(id: string, partnerName: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/chemi/readings", {
        method: "POST",
        headers: { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "star", kind: "compat", character, partnerId: id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(["CHEMI_LIMIT", "CHEMI_PAYMENT_REQUIRED"].includes(data?.error?.code) ? "dailyLimit" : "partnerFailure");
        return;
      }
      const rows: Connection[] = data.result.connections ?? legacyConnections(data.result.angles ?? []);
      setMatch({ name: partnerName, connections: rows.filter((row) => row.mine in copy.planets && row.theirs in copy.planets) });
    } catch {
      setError("partnerFailure");
    } finally {
      setBusy(false);
    }
  }

  async function add({ nickname, birth }: SheetResult) {
    setBusy(true);
    setError(null);
    try {
      const id = await savePartner(await getAccessToken(), nickname, birth);
      setPartners((list) => [...(list ?? []), { ...birth, id, nickname }]);
      setChosen(id);
      setAdding(false);
      await compare(id, nickname);
    } catch {
      setError("partnerFailure");
    } finally {
      setBusy(false);
    }
  }

  if (ready && !authenticated)
    return (
      <FanState
        kind="auth"
        title={text("starLogin")}
        actions={<FanAction onClick={() => void login()}><ReadingText id="login" /></FanAction>}
      />
    );

  const toolbar = (
    <div className={styles.toolbarRow}>
      <Toolbar name={name} back={match ? () => setMatch(null) : back} meta={<FanText role="meta"><ReadingText id="starMatch" /></FanText>} />
    </div>
  );
  const failure = error && (
    <FanState
      inline
      bodyTitle
      kind={error === "dailyLimit" ? "info" : "error"}
      title={text(error)}
      actions={
        error === "partnerFailure" && !adding ? (
          <FanAction
            size="sm"
            onClick={() => {
              setError(null);
              setReload((value) => value + 1);
            }}
          >
            <ReadingText id="retry" />
          </FanAction>
        ) : undefined
      }
    />
  );

  if (match) {
    const ways = matchWays(match.connections);
    const top = Math.max(...ways.slice(0, 3));
    return (
      <article className={styles.page} data-star-match="result">
        {toolbar}
        <div className={styles.main}>
          <header className={styles.head}>
            <FanText as="p" role="meta" className={styles.meta}>
              <ReadingText id="starMatch" />
            </FanText>
            <FanHeading as="h1">{text("pairMe", { name: match.name })}</FanHeading>
          </header>
          <div className={styles.two}>
            <section className={styles.panel}>
              <FanHeading as="h2">{copy.fourWays}</FanHeading>
              <div className={styles.ways}>
                {copy.domains.map((label, index) => {
                  const hits = ways[index];
                  const on = Math.min(5, 2 + hits);
                  return (
                    <div className={styles.way} key={label} data-top={(index < 3 && hits > 0 && hits === top) || undefined}>
                      <FanText role="label">{label}</FanText>
                      <span className={styles.meter} role="img" aria-label={`${label} ${on}/5`}>
                        {[0, 1, 2, 3, 4].map((step) => (
                          <i key={step} data-on={step < on || undefined} />
                        ))}
                      </span>
                      <FanText role="body">{copy.strengths[Math.min(2, hits)]}</FanText>
                    </div>
                  );
                })}
              </div>
            </section>
            {match.connections.length > 0 && (
              <section className={styles.section}>
                <FanHeading as="h2">{copy.aspects}</FanHeading>
                <dl className={styles.links}>
                  {match.connections.slice(0, 3).map((row) => (
                    <div key={`${row.mine}-${row.theirs}-${row.angle}`}>
                      <FanText as="dt" role="item">
                        {text("me")} {copy.planets[row.mine]} × {match.name} {copy.planets[row.theirs]}
                      </FanText>
                      <FanText as="dd" role="meta">
                        {row.angle}°
                      </FanText>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </div>
        <aside className={styles.side}>
          <div className={styles.say}>
            <img src={`/chemi/star/face-${character}-v1.webp`} alt="" />
            <FanText as="strong" role="item">
              {name}
            </FanText>
            <FanText as="p" role="meta">
              <ReadingText id="relationshipNote" />
            </FanText>
            <div className={styles.actions}>
              <FanAction onClick={() => setMatch(null)}>
                <ReadingText id="otherPartner" />
              </FanAction>
              <FanAction href={back}>
                <ReadingText id="return" />
              </FanAction>
            </div>
          </div>
          <FanText as="p" role="meta" className={styles.meta}>
            <ReadingText id="fun" />
          </FanText>
        </aside>
      </article>
    );
  }

  const picked = partners?.find((item) => item.id === chosen);
  return (
    <section className={styles.page} data-star-match="pick">
      {toolbar}
      <div className={styles.main}>
        <header className={styles.head}>
          <FanHeading as="h1">{copy.who}</FanHeading>
          <FanText role="label" className={styles.free}>
            {copy.freeToday}
          </FanText>
        </header>
        {failure}
        {partners === null && !error ? (
          <>
            <FanSkeletonStatus locale={locale} />
            <FanSkeletonRows rows={3} />
          </>
        ) : (
          <div className={styles.picker}>
            {(partners ?? []).map((item) => (
              <FanAction key={item.id} disabled={busy} aria-pressed={item.id === chosen} onClick={() => setChosen(item.id)}>
                <span className={styles.partner}>
                  <FanText role="item">{item.nickname}</FanText>
                  <FanText role="meta">{item.birthDate.replaceAll("-", ".")}</FanText>
                </span>
              </FanAction>
            ))}
            <FanAction variant="text" disabled={busy} onClick={() => setAdding(true)}>
              + <ReadingText id="newEntry" />
            </FanAction>
            {picked && (
              <FanAction variant="primary" disabled={busy} onClick={() => void compare(picked.id, picked.nickname)}>
                {copy.seeWith(picked.nickname)}
              </FanAction>
            )}
          </div>
        )}
      </div>
      {adding && (
        <BirthSheet
          open
          mode="partner"
          copy={birthCopy}
          busy={busy}
          error={error ? text(error) : null}
          onClose={() => setAdding(false)}
          onSave={add}
        />
      )}
    </section>
  );
}
