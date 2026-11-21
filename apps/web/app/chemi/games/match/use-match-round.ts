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

function snapshot(sim: ReturnType<typeof round>) {
  return { ...sim.state, layout: [...sim.layout] };
}

export function useMatchRound(
  ticket: Ticket | null,
  paused: boolean,
  onFinish: (body: Submission) => void,
) {
  const [view, setView] = useState<ReturnType<typeof snapshot> | null>(null);
  const pending = useRef<number | undefined>(undefined);
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
    pending.current = undefined;
    awaitingNext.current = false;
    setView(snapshot(sim));
    function frame(now: number) {
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
        Math.floor(previousTick / FPS) !== Math.floor(state.tick / FPS)
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
  return { view, tap, nextLevel };
}
