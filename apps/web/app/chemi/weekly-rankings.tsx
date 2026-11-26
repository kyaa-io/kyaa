"use client";

import { getExtraPlayCopy } from "@/features/chemi/ui/extra-play-copy";
import { useEffect, useMemo, useState } from "react";
import { FPS } from "@/features/chemi/games/engine";
import { rankName } from "@/features/chemi/games/rank-name";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import type { AppLocale } from "@/i18n/locales";
import { getMatchCopy } from "./games/match/copy";
import { GameRankings, type GameRanking } from "./game-rankings";
import type { HomeCopy } from "./home";

const allModes = [["pair", "match"], ["run", "run"]] as const;
type Row = { place: number; avatarUrl?: string | null; nickname: string; ticks: number; score?: number | null; isMe: boolean };
type Players = { total: number; week: number };
/** 상위 몇 명까지 보내는지(chemi_match_ranking 12 · chemi_run_ranking 20). 그 뒤 줄은 내 앞뒤 순위라 '더 보기'에 넣지 않는다. */
const TOP = { match: 12, run: 20 } as const;
const SHOWN = 5;
type Props = { copy: HomeCopy; locale: string; matchAvailable: boolean };

export function WeeklyRankings(props: Props) {
  const auth = useByUsAuth();
  return <RankingSession key={auth.user?.id ?? "guest"} auth={auth} {...props} />;
}

function RankingSession({ auth, copy, locale, matchAvailable }: Props & { auth: ReturnType<typeof useByUsAuth> }) {
  const { ready, authenticated, getAccessToken } = auth;
  const modes = useMemo(() => allModes.filter(([game]) => game !== "pair" || matchAvailable), [matchAvailable]);
  const [results, setResults] = useState<Partial<Record<"match" | "run", { rows: Row[]; players: Players | null } | "error">>>({});
  const [attempt, retry] = useState(0);
  const labels = getMatchCopy(locale);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    for (const [, mode] of modes) {
      void (async () => {
        const token = authenticated ? await getAccessToken() : null;
        const response = await fetch(`/api/chemi/games?game=${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ action: "ranking" }),
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        const { ranking, players } = await response.json() as { ranking: Row[]; players?: Players | null };
        if (!Array.isArray(ranking) || ranking.some((row) =>
          !row || !Number.isInteger(row.place) ||
          (typeof row.score === "number" ? !Number.isFinite(row.score) : mode === "run" || !Number.isFinite(row.ticks))
        )) throw Error();
        const counted = players && Number.isInteger(players.total) && Number.isInteger(players.week) ? { total: players.total, week: players.week } : null;
        if (!controller.signal.aborted) setResults((previous) => ({ ...previous, [mode]: { rows: ranking, players: counted } }));
      })().catch(() => {
        if (!controller.signal.aborted) setResults((previous) => ({ ...previous, [mode]: "error" }));
      });
    }
    return () => controller.abort();
  }, [ready, authenticated, getAccessToken, attempt, modes]);

  // Favorite Run ranks by points, not metres.
  // 네 자리 수도 묶음 점을 찍어 한 화면 숫자 표기를 하나로 둔다(es 는 기본값이 '3906'·'38.429'로 갈린다).
  const points = new Intl.NumberFormat(locale, { useGrouping: "always" });
  const count = new Intl.NumberFormat(locale);
  const games: GameRanking[] = modes.map(([game, mode]) => {
    const result = results[mode];
    const rows = result && result !== "error" ? result.rows : [];
    const format = (row: Row, index: number) => ({
      id: `${row.nickname}-${index}`,
      isMe: row.isMe,
      place: row.place,
      name: rankName(row.nickname, locale),
      avatar: row.avatarUrl ?? undefined,
      initial: row.nickname?.trim() ? undefined : null,
      change: 0,
      record: typeof row.score === "number" ? points.format(row.score) : [Math.floor(row.ticks / FPS / 60), Math.floor(row.ticks / FPS) % 60]
        .map((part) => String(part).padStart(2, "0")).join(":"),
    });
    const mine = rows.find((row) => row.isMe);
    return {
      game,
      title: copy.rankingOf.replace("{game}", copy[game]),
      href: `/chemi/games/${mode}?locale=${locale}`,
      leaders: rows.slice(0, SHOWN).map(format),
      more: rows.slice(SHOWN, TOP[mode]).map((row, index) => format(row, SHOWN + index)),
      players: result && result !== "error" ? result.players : null,
      mine: mine ? format(mine, -1) : null,
      status: result === "error" ? "error" : result === undefined ? "loading" : "ready",
    };
  });
  return <GameRankings games={games} label={copy.rankings} weekLabel={copy.thisWeek} mineLabel={copy.myRecord}
    vacantLabel={labels.vacant} empty={labels.emptyRanking} mineEmpty={getExtraPlayCopy(locale).myEmpty} start={copy.start} error={copy.rankingError} retryLabel={labels.retry}
    moreLabel={fanUiText(locale as AppLocale, "showMore")} lessLabel={fanUiText(locale as AppLocale, "collapse")}
    playersLabel={({ total, week }) => [copy.playersTotal.replace("{n}", count.format(total)), week > 0 ? copy.playersWeek.replace("{n}", count.format(week)) : null].filter(Boolean).join(" · ")}
    retry={() => { setResults({}); retry((value) => value + 1); }} />;
}
