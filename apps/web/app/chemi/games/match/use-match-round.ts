"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FPS, round, type Move } from "@/features/chemi/games/engine";

export type Ticket = { playId: string; seed: number; game: "match" };
export type Submission = {
  action: "finish";
  playId: string;
  moves: Move[];
  ticks: number;
  score: number;
};

/** 1·2·3라운드는 시계가 돌기 전에 카드 앞면을 3·4·5초 보여 준다(기획 08-1 05). 이번 주 랭킹과 섞이지 않게 다음 주간 마감(2026-11-23 0시 KST)부터 켠다. */
export const PREVIEW_SECONDS = [3, 4, 5] as const;
const PREVIEW_FROM = Date.UTC(2026, 10, 22, 15);

function snapshot(sim: ReturnType<typeof round>, preview = 0) {
  return { ...sim.state, layout: [...sim.layout], preview };
}

export function useMatchRound(
  ticket: Ticket | null,
  paused: boolean,
  onFinish: (body: Submission) => void,
) {
  const [view, setView] = useState<ReturnType<typeof snapshot> | null>(null);
  const pending = useRef<number | undefined>(undefined);
  const endCleared = useRef<() => void>(() => {});
  const awaitingNext = useRef(false);
  const nextLevel = () => { awaitingNext.current = false; };
  const pause = useRef(paused);
  const finish = useRef(onFinish);
  pause.current = paused;
  finish.current = onFinish;
  const tap = useCallback((index: number) => {
    if (!pause.current && !awaitingNext.current && pending.current === undefined)
      pending.current = index;
  }, []);

  useEffect(() => {
    if (!ticket) {
      setView(null);
      return;
    }
    const { seed, playId } = ticket;
    const sim = round("match", seed);
    const moves: Move[] = [];
    let handle = 0;
    let last = performance.now();
    let fraction = 0;
    const previewOn = Date.now() >= PREVIEW_FROM;
    let previewStage = 0;
    let previewUntil = 0;
    pending.current = undefined;
    awaitingNext.current = false;
    setView(snapshot(sim));
    endCleared.current = () => {
      if (!awaitingNext.current) return;
      cancelAnimationFrame(handle);
      awaitingNext.current = false;
      finish.current({action: "finish", playId, ticks: sim.state.tick, score: sim.state.score, moves});
    };
    function frame(now: number) {
      // 다음 라운드 배치는 첫 걸음에서 깔리므로, 미리 보기는 라운드 넘김 직후 판을 먼저 바꿔 둔 뒤 시작한다.
      if (previewOn && !pause.current && !awaitingNext.current && previewStage !== sim.state.stage + Number(sim.state.cleared)) {
        const stage = sim.state.stage + Number(sim.state.cleared);
        previewStage = stage;
        previewUntil = stage <= PREVIEW_SECONDS.length ? now + PREVIEW_SECONDS[stage - 1] * 1000 : 0;
        if (previewUntil && sim.state.cleared) {
          sim.step();
        }
      }
      if (previewUntil > now && !pause.current) {
        pending.current = undefined;
        last = now;
        setView(snapshot(sim, Math.ceil((previewUntil - now) / 1000)));
        handle = requestAnimationFrame(frame);
        return;
      }
      if (previewUntil && previewUntil <= now) {
        previewUntil = 0;
        setView(snapshot(sim));
      }
      if (previewUntil > now) previewUntil += now - last;
      if (!pause.current && !awaitingNext.current) fraction += ((now - last) * FPS) / 1000;
      else pending.current = undefined;
      last = now;
      const { first, second, matched, stage, tick: previousTick } = sim.state;
      while (fraction >= 1 && !sim.state.done) {
        fraction--;
        const tick = sim.state.tick + 1;
        let input: number | undefined;
        if (
          pending.current !== undefined &&
          tick - (moves.at(-1)?.[0] ?? -6) >= 6
        ) {
          input = pending.current;
          pending.current = undefined;
          if (
            sim.state.second < 0 &&
            sim.state.first !== input &&
            !(sim.state.matched & (1 << input))
          )
            moves.push([tick, input]);
          else input = undefined;
        }
        sim.step(input);
        if (sim.state.cleared && !sim.state.done) {
          awaitingNext.current = true;
          fraction = 0;
          break;
        }
      }
      const state = sim.state;
      if (
        state.done ||
        stage !== state.stage ||
        first !== state.first ||
        second !== state.second ||
        matched !== state.matched ||
        Math.floor(previousTick / 6) !== Math.floor(state.tick / 6)
      ) {
        setView(snapshot(sim));
      }
      if (state.done)
        finish.current({
          action: "finish",
          playId,
          ticks: state.tick,
          score: state.score,
          moves,
        });
      else handle = requestAnimationFrame(frame);
    }
    handle = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(handle);
    };
  }, [ticket]);
  return { view, tap, nextLevel, finishLevel: () => endCleared.current() };
}
