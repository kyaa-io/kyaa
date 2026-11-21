"use client";

import { useEffect, useMemo, useState } from "react";
import { FPS } from "@/features/chemi/games/engine";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { getMatchCopy } from "./games/match/copy";
import { GameRankings, type GameRanking } from "./game-rankings";
import type { HomeCopy } from "./home";

const allModes = [["pair", "match"], ["run", "run"]] as const;
type Row = { place: number; nickname: string; ticks: number; score: number; isMe: boolean };
type Props = { copy: HomeCopy; locale: string; matchAvailable: boolean };

export function WeeklyRankings(props: Props) {
  const auth = useByUsAuth();
  return <RankingSession key={auth.user?.id ?? "guest"} auth={auth} {...props} />;
}

function RankingSession({ auth, copy, locale, matchAvailable }: Props & { auth: ReturnType<typeof useByUsAuth> }) {
  const { ready, authenticated, getAccessToken } = auth;
  const modes = useMemo(() => allModes.filter(([game]) => game !== "pair" || matchAvailable), [matchAvailable]);
  const [results, setResults] = useState<Partial<Record<"match" | "run", Row[] | "error">>>({});
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
        const { ranking } = await response.json() as { ranking: Row[] };
        if (!Array.isArray(ranking)) throw Error();
        if (!controller.signal.aborted) setResults((previous) => ({ ...previous, [mode]: ranking }));
      })().catch(() => {
        if (!controller.signal.aborted) setResults((previous) => ({ ...previous, [mode]: "error" }));
      });
    }
    return () => controller.abort();
  }, [ready, authenticated, getAccessToken, attempt, modes]);

  // Favorite Run ranks by points, not metres.
  const points = new Intl.NumberFormat(locale);
  const games: GameRanking[] = modes.map(([game, mode]) => {
    const result = results[mode];
    const rows = Array.isArray(result) ? result : [];
    const format = (row: Row, index: number) => ({
      id: `${row.nickname}-${index}`,
      isMe: row.isMe,
      place: row.place,
      name: row.nickname,
      change: 0,
      record: mode === "run" ? points.format(row.score) : row.score != null ? row.score.toLocaleString(locale) : [Math.floor(row.ticks / FPS / 60), Math.floor(row.ticks / FPS) % 60]
        .map((part) => String(part).padStart(2, "0")).join(":"),
    });
    const mine = rows.find((row) => row.isMe);
    return {
      game,
      title: copy.rankingOf.replace("{game}", copy[game]),
      href: `/chemi/games/${mode}?locale=${locale}`,
      leaders: rows.slice(0, 3).map(format),
      mine: mine ? format(mine, -1) : null,
      status: result === "error" ? "error" : result === undefined ? "loading" : "ready",
    };
  });
  return <GameRankings games={games} label={copy.rankings} weekLabel={copy.thisWeek} mineLabel={copy.myRecord}
    empty={labels.emptyRanking} start={copy.start} error={labels.error} retryLabel={labels.retry}
    retry={() => { setResults({}); retry((value) => value + 1); }} />;
}
