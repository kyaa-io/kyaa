"use client";

import { useEffect, useState } from "react";
import { FanText } from "@/components/fan-ui/fan-text";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { getMatchCopy } from "./games/match/copy";
import styles from "./home.module.css";

type Lobby = { freeRemaining: number; extraRemaining: number; extraCost: number };

export function GameStatusChip({ game, locale }: { game: "pair" | "run"; locale: string }) {
  const { authenticated, ready, user, getAccessToken } = useByUsAuth();
  const owner = user?.id;
  const [result, setResult] = useState<{ owner: string; lobby: Lobby }>();
  useEffect(() => {
    if (!ready || !authenticated || !owner) return;
    const controller = new AbortController();
    async function load(userId: string) {
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch(`/api/chemi/games?game=${game === "pair" ? "match" : "run"}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "lobby" }),
        signal: controller.signal,
      });
      if (!response.ok) return;
      const lobby: Lobby = await response.json();
      if (!controller.signal.aborted) setResult({ owner: userId, lobby });
    }
    void load(owner).catch(() => {});
    return () => controller.abort();
  }, [ready, authenticated, owner, getAccessToken, game]);
  if (!authenticated || !result || result.owner !== owner) return null;
  const copy = getMatchCopy(locale);
  const { freeRemaining, extraRemaining, extraCost } = result.lobby;
  const label = freeRemaining > 0 ? `${copy.freePlays} ${freeRemaining}`
    : extraRemaining > 0 ? `${copy.extraPlay} ${extraCost}P` : copy.noMore;
  return <FanText role="label" className={styles.statusChip} title={label}>{label}</FanText>;
}
