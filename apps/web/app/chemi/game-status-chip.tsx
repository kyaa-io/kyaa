"use client";

import { useEffect, useState } from "react";
import { FanText } from "@/components/fan-ui/fan-text";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import type { HomeCopy } from "./home";
import styles from "./home.module.css";

type Lobby = { freeRemaining: number; extraCost: number };

export function GameStatusChip({ game, copy }: { game: "pair" | "run"; copy: HomeCopy }) {
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
  const { freeRemaining, extraCost } = result.lobby;
  const label = freeRemaining > 0 ? copy.playsLeft.replace("{n}", String(freeRemaining))
    : extraCost > 0 ? copy.extraCost.replace("{n}", String(extraCost)) : copy.playsDone;
  return <FanText role="label" className={styles.statusChip} title={label}>{label}</FanText>;
}
