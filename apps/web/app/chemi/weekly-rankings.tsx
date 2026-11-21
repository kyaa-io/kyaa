"use client";

import { useEffect, useState } from "react";
import { FPS } from "@/features/chemi/games/engine";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { getMatchCopy } from "./games/match/copy";
import { GameRankings, type GameRanking } from "./game-rankings";
import type { HomeCopy } from "./home";

const modes = [["pair", "match"], ["run", "run"]] as const;
type Row = { place: number; nickname: string; ticks: number; score: number; isMe: boolean };

export function WeeklyRankings({ copy, locale }: { copy: HomeCopy; locale: string }) {
  const auth = useByUsAuth();
  return <RankingSession key={auth.user?.id ?? "guest"} auth={auth} copy={copy} locale={locale} />;
}

function RankingSession({ auth, copy, locale }: { auth: ReturnType<typeof useByUsAuth>; copy: HomeCopy; locale: string }) {
  const { ready, authenticated, getAccessToken } = auth;
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
  }, [ready, authenticated, getAccessToken, attempt]);

  const distance = new Intl.NumberFormat(locale, { style: "unit", unit: "meter" });
  const games: GameRanking[] = modes.map(([game, mode]) => {
    const result = results[mode];
    const rows = Array.isArray(result) ? result : [];
    const format = (row: Row, index: number) => ({
      id: `${row.nickname}-${index}`,
      place: row.place,
      name: row.nickname,
      change: 0,
      record: mode === "run" ? distance.format(row.score) : [Math.floor(row.ticks / FPS / 60), Math.floor(row.ticks / FPS) % 60]
        .map((part) => String(part).padStart(2, "0")).join(":"),
    });
    const mine = rows.find((row) => row.isMe);
    return {
      game,
      title: copy[game],
      href: `/chemi/games/${mode}?locale=${locale}`,
      leaders: rows.slice(0, 3).map(format),
      mine: mine ? { ...format(mine, -1), name: labels.me } : null,
      status: result === "error" ? "error" : result === undefined ? "loading" : "ready",
    };
  });
  return <GameRankings games={games} label={copy.rankings} empty={labels.emptyRanking}
    error={labels.error} retryLabel={labels.retry} playLabel={labels.start} mineLabel={labels.me}
    retry={() => { setResults({}); retry((value) => value + 1); }} />;
}
