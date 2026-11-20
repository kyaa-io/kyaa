"use client";

/**
 * 최애 사주 흐름: 입장 → (생일) → 계산 → 대화 1~4 → 풀이 → 올해·이달·궁합.
 * 단계는 주소의 `step`·`view` 와 같고, 결과 번호는 `r` 에 둔다(arch-chemi §4.2).
 * 공통 부품 대기: 대화 틀(장면·말풍선·고르기 띠)은 운세 구현(t3/chemi-w3-fortune-fix2)에 같은 모양이 있다.
 * 병합 뒤 CHEMI-W2-FRAME-EXTRACT 로 뽑은 부품으로 바꾼다.
 */
import { useReadingCopy, ReadingText } from "@/features/chemi/i18n/reading-ui";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanDialog, FanSheet } from "@/components/fan-ui/fan-dialog";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanText } from "@/components/fan-ui/fan-text";
import { MediaBackdrop, mediaFillClass } from "@/components/fan-ui/media-fill";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { celebrateReward } from "@/components/fan-ui/reward-celebration";
import {
  FanSkeleton,
  FanSkeletonRows,
  FanSkeletonStatus,
} from "@/components/fan-ui/fan-skeleton";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import koCatalog from "@/features/chemi/i18n/locales/ko/chemi.json";
import type { AppLocale } from "@/i18n/locales";
import type { MyBirthCopy } from "@/features/chemi/ui/frame/birth-copy";
import { BirthSheet, type SheetResult } from "./birth-sheet";
import { monthReading, firstReading, yearReading } from "./copy";
import { sajuCharacters, sajuTalkLine, sajuTone, type SajuCharacterId, type SajuLineInput } from "./lines";
import {
  ChemiRequestError,
  isAuthFailure,
  listFirsts,
  loadProfile,
  loadPairReading,
  loadReading,
  orAbort,
  requestFirst,
  requestPair,
  saveBirth,
  savePartner,
  type Partner,
  type SajuReading,
} from "./reading";
import { SajuResult, type Pair, type ResultView } from "./result";
import resultStyles from "./result.module.css";
import styles from "./scene.module.css";
import sheetStyles from "./sheet.module.css";

const steps = ["enter", "calc", "talk-1", "talk-2", "talk-3", "talk-4", "result"] as const;
type Step = (typeof steps)[number];
const views: readonly ResultView[] = ["first", "year", "month", "pair"];
const talkChoice = ["agree", "whatYear", "whatUs", "summarize"] as const;
const art = "/chemi/saju";

/** r: 첫 풀이 번호 · p: 궁합 풀이 번호 · w: 궁합 상대 번호 */
type Nav = { step: Step; view: ResultView; character: SajuCharacterId; r: string | null; p: string | null; w: string | null };
type Phase = "idle" | "calc" | "pairCalc" | "error" | "limit";
type Failure = "auth" | "service" | "network";
const failureTitle = {
  auth: "expired",
  service: "sajuFailure",
  network: "offline",
} as const;
type Sheet = null | "login" | "birth" | "topics" | "pairPick" | "pair";

const talkOf = (step: Step) => {
  const match = /^talk-([1-4])$/.exec(step);
  return match ? (Number(match[1]) as 1 | 2 | 3 | 4) : null;
};

function readUrl(search = window.location.search): Nav {
  const params = new URLSearchParams(search);
  const character = sajuCharacters.find((item) => item.id === params.get("c"));
  return {
    step: steps.find((item) => item === params.get("step")) ?? "enter",
    view: views.find((item) => item === params.get("view")) ?? "first",
    character: character?.id ?? "changha",
    r: params.get("r"),
    p: params.get("p"),
    w: params.get("w"),
  };
}

/** 풀이를 불러올 수 없을 때 돌아가는 입장 상태. */
const toEnter = (url: Nav): Nav => ({ ...url, step: "enter", view: "first", r: null, p: null, w: null });
const clearedUrl = { step: null, view: null, r: null, p: null, w: null };

/** 이 흐름이 쌓은 기록 칸 수. 새 탭에서 복원한 주소는 0이다. */
function flowDepth() {
  const depth = (window.history.state as { sajuDepth?: number } | null)?.sajuDepth;
  return typeof depth === "number" ? depth : 0;
}

function writeUrl(patch: Record<string, string | null>, mode: "push" | "replace", depth?: number) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch))
    value === null ? params.delete(key) : params.set(key, value);
  const url = `${window.location.pathname}?${params}`;
  if (mode === "push") window.history.pushState({ sajuDepth: flowDepth() + 1 }, "", url);
  else
    window.history.replaceState(
      depth === undefined ? window.history.state : { sajuDepth: depth },
      "",
      url,
    );
  window.dispatchEvent(new Event("saju-navigation"));
}

function subscribeUrl(update: () => void) {
  window.addEventListener("popstate", update);
  window.addEventListener("saju-navigation", update);
  return () => {
    window.removeEventListener("popstate", update);
    window.removeEventListener("saju-navigation", update);
  };
}

const currentSearch = () => window.location.search;
const serverSearch = () => "";

export function SajuFlow({
  locale,
  birthCopy,
  sceneCopy = { ...koCatalog.sajuScene, title: koCatalog.home.saju },
  restoring: restoringFromUrl = false,
}: {
  locale: AppLocale;
  /** 생일 입력 시트의 글. MY 생일 정보와 같은 글을 쓴다. */
  birthCopy: MyBirthCopy;
  sceneCopy?: typeof koCatalog.sajuScene & { title: string };
  /** 주소에 단계와 결과가 있어 저장된 결과를 불러오는 중이면 입장 화면 대신 불러오는 모양을 그린다. */
  restoring?: boolean;
}) {
  const text = useReadingCopy();
  const { ready, authenticated, getAccessToken, login } = useByUsAuth();
  const nav = readUrl(useSyncExternalStore(subscribeUrl, currentSearch, serverSearch));
  const [reading, setReading] = useState<SajuReading>();
  const [firsts, setFirsts] = useState<Partial<Record<SajuCharacterId, string>> | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<Failure>("network");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [needBirth, setNeedBirth] = useState(false);
  const [birthBusy, setBirthBusy] = useState(false);
  const [birthError, setBirthError] = useState<string | null>(null);
  const [under14, setUnder14] = useState(false);
  const [restoring, setRestoring] = useState(restoringFromUrl);
  const [points, setPoints] = useState(0);
  const [exp, setExp] = useState(0);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [pair, setPair] = useState<Pair>();
  const [pairName, setPairName] = useState("");
  const [sharing, setSharing] = useState(false);
  const collapsing = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const navRef = useRef(nav);
  /** 이 화면에서 본 궁합 풀이. 뒤로·앞으로 이동할 때 주소의 번호로 다시 꺼낸다. */
  const pairs = useRef(new Map<string, Pair>());
  const lastPair = useRef<{ partnerId: string; who: string; timeKnown: boolean } | null>(null);
  /** 뒤로·앞으로 이동으로 기록을 불러오다 멈췄을 때 '다시 시도'가 부르는 같은 불러오기. */
  const restoreRetry = useRef<(() => void) | null>(null);
  const now = Date.now();

  const { step, view, character } = nav;
  const talk = talkOf(step);
  const index = sajuCharacters.findIndex((item) => item.id === character);
  const name = sajuCharacters[index].name;
  const chart = reading?.result;
  const again = Boolean(firsts?.[character]);

  const commit = useCallback((patch: Partial<Nav>, mode: "push" | "replace", depth?: number) => {
    const next = { ...navRef.current, ...patch };
    navRef.current = next;
    writeUrl(
      {
        step: next.step === "enter" ? null : next.step,
        view: next.step === "result" && next.view !== "first" ? next.view : null,
        c: next.character,
        r: next.r,
        p: next.step === "result" && next.view === "pair" ? next.p : null,
        w: next.step === "result" && next.view === "pair" ? next.w : null,
      },
      mode,
      depth,
    );

  }, []);

  /** 이 로그인으로 받은 오늘 보상. 새로 받은 값이면 축하를 띄운다. */
  const settle = useCallback(
    async (data: SajuReading<unknown>, id: SajuCharacterId, token: string | null) => {
      setExp(data.reward?.exp ?? 0);
      setPoints(data.reward?.points ?? 0);
      if (!data.replayed && data.reward)
        celebrateReward({
          locale,
          points: data.reward.points,
          stamps: Number(Boolean(data.reward.stamp)),
        });
      const response = await fetch("/api/chemi/rewards/today", {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!response?.ok) return;
      const today = await response.json();
      if (today.claimedPoints > 0) celebrateReward({ locale, points: today.claimedPoints });
      setPoints(
        today.grants?.find((item: { character: string }) => item.character === id)?.points ??
          data.reward?.points ??
          0,
      );
    },
    [locale],
  );

  /** 주소의 궁합 풀이 번호로 궁합 결과를 되살린다. 상대가 이미 지워졌으면 이름을 '상대'로 둔다. */
  const restorePair = useCallback(async (token: string | null, url: Nav, signal?: AbortSignal) => {
    if (!url.p) return null;
    const cached = pairs.current.get(url.p);
    if (cached) return cached;
    const result = await loadPairReading(token, url.p, url.character, signal);
    if (!result) return null;
    const profile = await loadProfile(token, signal).catch(() => null);
    const partner = profile?.partners.find((item) => item.id === url.w);
    const restored: Pair = {
      id: url.p,
      name: partner?.nickname ?? text("partner"),
      result,
      timeKnown: partner ? partner.timePrecision !== "unknown" : true,
    };
    pairs.current.set(url.p, restored);
    return restored;
  }, []);

  // 첫 진입: 주소의 단계·최애를 읽는다. 결과가 없으면 입장으로 돌린다.
  useEffect(() => {
    const url = readUrl();
    navRef.current = url;

    if (url.step === "enter" || url.step === "calc") {
      if (url.step === "calc") writeUrl({ step: null }, "replace", 0);
      setRestoring(false);
      return;
    }
    if (!url.r) {
      writeUrl(clearedUrl, "replace", 0);
      navRef.current = toEnter(url);

      setRestoring(false);
      return;
    }
    if (!ready) return;
    if (!authenticated) {
      writeUrl(clearedUrl, "replace", 0);
      navRef.current = toEnter(url);

      setRestoring(false);
      return;
    }
    void (async () => {
      try {
        const token = await getAccessToken();
        const data = await loadReading(token, url.r!, url.character);
        if (!data) throw Error();
        setReading({ ...data, replayed: true });
        void settle({ ...data, replayed: true }, url.character, token);
        if (url.view === "pair") {
          const restored = await restorePair(token, url);
          if (restored) setPair(restored);
          else {
            commit({ view: "first", p: null, w: null }, "replace");
            showFanToast({ title: text("pairMissing") });
          }
        }
      } catch {
        writeUrl(clearedUrl, "replace", 0);
        navRef.current = toEnter(url);

        showFanToast({ title: text("readingMissing") });
      } finally {
        setRestoring(false);
      }
    })();
    // 한 번만 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  // 입장: 이미 본 최애를 알아야 '또 왔네' 장면을 고른다. 본 풀이 한 건은 미리 받아 둔다.
  useEffect(() => {
    if (!ready || !authenticated) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const token = await getAccessToken();
        const found = await listFirsts(token, controller.signal);
        if (controller.signal.aborted) return;
        setFirsts(found);
        const any = Object.values(found)[0];
        if (any && !reading) {
          const data = await loadReading(token, any, navRef.current.character, controller.signal);
          if (data && !controller.signal.aborted) setReading((current) => current ?? { ...data, replayed: true });
        }
      } catch {
        if (!controller.signal.aborted) setFirsts({});
      }
    })();
    return () => controller.abort();
    // 로그인 상태가 정해질 때 한 번만 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  useEffect(() => () => abort.current?.abort(), []);
  const tokenRef = useRef(getAccessToken);
  tokenRef.current = getAccessToken;
  // 장면이 결과 화면 자리를 대신할 때(계산·한도·오류) 스크롤이 남아 있으면 장면이 화면 밖에 그려진다.
  useEffect(() => {
    if (phase !== "idle") window.scrollTo(0, 0);
  }, [phase]);

  const run = useCallback(
    async (id: SajuCharacterId) => {
      restoreRetry.current = null;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15000);
      setPhase("calc");
      const started = Date.now();
      try {
        const token = await orAbort(getAccessToken(), controller.signal);
        const data = await requestFirst(token, id, controller.signal);
        await orAbort(new Promise((resolve) => setTimeout(resolve, Math.max(0, 1200 - (Date.now() - started)))), controller.signal);
        if (abort.current !== controller) return;
        setReading(data);
        setFirsts((current) => ({ ...current, [id]: data.readingId }));
        setPhase("idle");
        setNeedBirth(false);
        void settle(data, id, token);
        commit({ step: "talk-1", r: data.readingId }, "replace");
      } catch (error) {
        // 다른 단계로 떠났거나 새 요청이 이어받은 요청의 끝은 화면에 반영하지 않는다.
        if (abort.current !== controller) return;
        if (error instanceof ChemiRequestError && error.code === "CHEMI_BIRTH_REQUIRED") {
          commit({ step: "enter" }, "replace", 0);
          setPhase("idle");
          setNeedBirth(true);
          setSheet("birth");
          return;
        }
        setFailure(
          timedOut || !(error instanceof ChemiRequestError)
            ? "network"
            : isAuthFailure(error)
              ? "auth"
              : "service",
        );
        setPhase("error");
      } finally {
        clearTimeout(timer);
      }
    },
    [commit, getAccessToken, settle],
  );

  // 브라우저 뒤로·앞으로 이동. 결과가 없던 기록으로 가면 입장으로 돌린다.
  useEffect(() => {
    function onPop() {
      if (collapsing.current) return;
      const url = readUrl();
      const current = navRef.current;
      // 시트·겹친 판을 닫으며 생긴 뒤로 가기는 주소가 같다. 닫히는 판은 공용 오버레이가 스스로 닫으므로
      // 여기서 시트를 지우지 않는다(겹친 판만 닫혀야 할 때 입력 시트까지 닫힌다). 진행 중인 요청도 끊지 않는다.
      if (url.step === current.step && url.view === current.view && url.r === current.r && url.p === current.p && url.character === current.character && url.w === current.w) return;
      abort.current?.abort();
      abort.current = null;
      restoreRetry.current = null;
      setPhase("idle");
      setRestoring(false);
      setSheet(null);
      const reachable = Boolean(url.r) && url.step !== "calc";
      const next: Nav = url.step === "enter" || reachable ? url : toEnter(url);
      navRef.current = next;
      if (next.step !== url.step)
        writeUrl(
          { step: next.step === "enter" ? null : next.step, view: next.view === "first" ? null : next.view },
          "replace",
        );

      // 다른 사주 기록으로 오면 그 기록의 풀이를 꺼낸다. 궁합 기록이면 그 궁합 풀이도 꺼낸다.
      const needReading = next.step !== "enter" && Boolean(next.r) && next.r !== reading?.readingId;
      const wantsPair = next.step === "result" && next.view === "pair";
      const known = wantsPair && next.p ? pairs.current.get(next.p) : undefined;
      if (!needReading && (!wantsPair || known)) {
        if (known) setPair(known);
        return;
      }
      // 계산 경로와 같이 15초 제한·중단 신호를 쓴다. 제한을 넘기면 오류 화면에서 다시 시도할 수 있다.
      lastPair.current = null;
      const attempt = () => {
        abort.current?.abort();
        const controller = new AbortController();
        abort.current = controller;
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, 15000);
        setPhase("idle");
        setRestoring(true);
        void (async () => {
          try {
            const token = await orAbort(tokenRef.current(), controller.signal);
            if (needReading) {
              const data = await loadReading(token, next.r!, next.character, controller.signal);
              if (controller.signal.aborted) throw Error();
              if (!data) throw Error();
              setReading({ ...data, replayed: true });
            }
            if (!wantsPair) return;
            try {
              const restored = await restorePair(token, next, controller.signal);
              if (controller.signal.aborted) throw Error();
              if (!restored) throw Error();
              setPair(restored);
            } catch (error) {
              if (controller.signal.aborted) throw error;
              commit({ view: "first", p: null, w: null }, "replace");
              showFanToast({ title: "저장된 궁합이 아니라 사주 풀이로 돌아왔어요." });
            }
          } catch {
            // 다른 이동이 이어받은 요청의 끝은 화면에 반영하지 않는다.
            if (abort.current !== controller) return;
            if (timedOut) {
              setFailure("network");
              setPhase("error");
              return;
            }
            writeUrl(clearedUrl, "replace", 0);
            navRef.current = toEnter(next);

            showFanToast({ title: "저장된 풀이가 아니라 처음 화면으로 돌아왔어요." });
          } finally {
            clearTimeout(timer);
            if (abort.current === controller) setRestoring(false);
          }
        })();
      };
      restoreRetry.current = attempt;
      attempt();
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [commit, reading, restorePair]);

  function start() {
    if (!authenticated) return setSheet("login");
    commit({ step: "calc" }, "push");
    void run(character);
  }

  async function saveMyBirth({ birth }: SheetResult) {
    setBirthBusy(true);
    setBirthError(null);
    try {
      await saveBirth(await getAccessToken(), birth);
      setSheet(null);
      commit({ step: "calc" }, "push");
      void run(character);
    } catch (error) {
      if (error instanceof ChemiRequestError && error.code === "CHEMI_UNDER_14") {
        setSheet(null);
        setUnder14(true);
      } else {
        setBirthError("저장하지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      setBirthBusy(false);
    }
  }

  function choose(next: number) {
    const id = sajuCharacters[(next + sajuCharacters.length) % sajuCharacters.length].id;
    commit({ character: id }, "replace");
  }

  /** 풀이로 들어갈 때 대화 칸들을 접어, 뒤로 가면 입장이 되게 한다. */
  function openResult() {
    const keep = { r: reading?.readingId ?? navRef.current.r };
    const depth = flowDepth();
    if (depth === 0) {
      commit({ step: "result", view: "first", ...keep }, "replace");
      return;
    }
    collapsing.current = true;
    const reset = () => {
      window.removeEventListener("popstate", reset);
      commit({ step: "result", view: "first", ...keep }, "push");
      collapsing.current = false;
    };
    window.addEventListener("popstate", reset);
    window.history.go(-depth);
  }

  function advance() {
    if (talk === 4) return openResult();
    commit({ step: steps[steps.indexOf(step) + 1] }, "push");
  }

  /** 입장에서 '더 깊이'를 누르면 이미 받아 둔 풀이로 올해·이달로 간다. */
  function openView(next: ResultView) {
    setSheet(null);
    if (!reading) return;
    commit({ step: "result", view: next, r: reading.readingId }, step === "result" ? "push" : "push");
  }

  async function share() {
    if (!reading || sharing) return;
    setSharing(true);
    try {
      const headers = {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      };
      const response = await fetch("/api/chemi/shares", {
        method: "POST",
        headers,
        body: JSON.stringify({ readingId: reading.readingId, character }),
      });
      if (!response.ok) throw Error();
      const card = await response.json();
      await navigator.clipboard.writeText(new URL(card.url, location.origin).href);
      showFanToast({ title: "결과를 복사했어요", tone: "success" });
      await fetch(`/api/chemi/shares/${encodeURIComponent(card.shareId)}/done`, {
        method: "POST",
        headers,
        body: JSON.stringify({ via: "copy" }),
      }).catch(() => {});
    } catch {
      showFanToast({ title: "복사하지 못했어요", tone: "error" });
    } finally {
      setSharing(false);
    }
  }

  /** 궁합: 저장해 둔 상대가 있으면 고르게 하고, 없으면 바로 입력으로 간다. */
  async function openPair() {
    if (!authenticated) return setSheet("login");
    try {
      const profile = await loadProfile(await getAccessToken());
      setPartners(profile.partners);
      setSheet(profile.partners.length ? "pairPick" : "pair");
    } catch {
      showFanToast({ title: "상대 목록을 불러오지 못했어요", tone: "error" });
    }
  }

  async function runPair(partnerId: string, who: string, timeKnown: boolean) {
    restoreRetry.current = null;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    lastPair.current = { partnerId, who, timeKnown };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    setPairName(who);
    setSheet(null);
    setPhase("pairCalc");
    const started = Date.now();
    try {
      const token = await orAbort(getAccessToken(), controller.signal);
      const data = await requestPair(token, character, partnerId, controller.signal);
      await orAbort(new Promise((resolve) => setTimeout(resolve, Math.max(0, 1200 - (Date.now() - started)))), controller.signal);
      if (abort.current !== controller) return;
      const next: Pair = { id: data.readingId, name: who, result: data.result, timeKnown };
      pairs.current.set(next.id, next);
      setPair(next);
      setPhase("idle");
      lastPair.current = null;
      void settle(data, character, token);
      // 첫 풀이 번호도 함께 둔다. 입장에서 바로 궁합을 본 경우 주소에 아직 없다.
      commit(
        { step: "result", view: "pair", r: reading?.readingId ?? navRef.current.r, p: next.id, w: partnerId },
        "push",
      );
    } catch (error) {
      if (abort.current !== controller) return;
      if (
        error instanceof ChemiRequestError &&
        (error.code === "CHEMI_LIMIT" || error.code === "CHEMI_PAYMENT_REQUIRED")
      ) {
        setPhase("limit");
        return;
      }
      setFailure(
        timedOut || !(error instanceof ChemiRequestError)
          ? "network"
          : isAuthFailure(error)
            ? "auth"
            : "service",
      );
      setPhase("error");
    } finally {
      clearTimeout(timer);
    }
  }

  async function savePair({ nickname, birth }: SheetResult) {
    setBirthBusy(true);
    setBirthError(null);
    try {
      const id = await savePartner(await getAccessToken(), nickname, birth);
      setBirthBusy(false);
      await runPair(id, nickname, birth.timePrecision !== "unknown");
    } catch (error) {
      setBirthBusy(false);
      setBirthError(
        error instanceof ChemiRequestError && error.code === "CHEMI_PARTNER_FULL"
          ? "저장한 상대가 가득 찼어요. 저장한 상대에서 골라 주세요."
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    }
  }

  const back = `/chemi?locale=${locale}`;

  if (under14)
    return (
      <div className={styles.under}>
        <FanText as="p" role="body">
          <ReadingText id="age" />
        </FanText>
        <FanAction href={back}>{text("chemiBack")}</FanAction>
      </div>
    );

  if (restoring)
    return (
      <section className={resultStyles.layout} aria-busy="true">
        <div className={resultStyles.main}>
          <header className={resultStyles.head}>
            <FanSkeleton width="30%" />
            <FanSkeleton width="65%" />
            <FanSkeletonStatus locale={locale} />
            <FanSkeleton shape="block" className={resultStyles.loadingHero} />
          </header>
          <div className={resultStyles.panel} aria-hidden="true">
            <FanSkeleton width="30%" />
            <FanSkeletonRows rows={4} />
          </div>
        </div>
      </section>
    );

  const activePair = pair && pair.id === nav.p ? pair : undefined;
  if (step === "result" && reading && phase !== "pairCalc" && phase !== "limit" && phase !== "error")
    return (
      <>
        <SajuResult
          locale={locale}
          character={character}
          view={view === "pair" && !activePair ? "first" : view}
          chart={reading.result}
          at={now}
          points={points}
          exp={exp}
          pair={activePair}
          sharing={sharing}
          backLabel={sceneCopy.back}
          onBack={() => window.history.back()}
          onShare={share}
          onTopics={() => setSheet("topics")}
          onGo={openView}
          onScene={() => commit(toEnter(nav), "push")}
          onPair={() => void openPair()}
          onBirthTime={() => setSheet("birth")}
        />
        {renderSheets()}
      </>
    );

  const first = chart ? firstReading(chart, now) : null;
  const lineInput: SajuLineInput | null =
    chart && first
      ? {
          image: first.image,
          trait: first.trait,
          strengthN: first.strengthN,
          cautionN: first.cautionN,
          bond: first.bond,
          yearTitle: yearReading(chart, now).title,
        }
      : null;
  const tone = sajuTone(character);
  const greeting = {
    changha: ["helloChangha", "againChangha"],
    elina: ["helloElina", "againElina"],
    yuna: ["helloYuna", "againYuna"],
    dosa: ["helloDosa", "againDosa"],
  } as const;
  const entering = step === "enter" && !needBirth;
  const line =
    phase === "pairCalc" || phase === "limit"
      ? phase === "limit"
        ? text("dailyLimit")
        : tone.pairCalc(pairName)
      : step === "calc"
        ? tone.calc
        : talk && lineInput
          ? sajuTalkLine(character, talk, lineInput)
          : needBirth
            ? tone.birth
            : again && entering
              ? text(greeting[character][1])
              : text(greeting[character][0]);

  const wideArt = character === "changha" ? `${art}/saju-changha-wide-v1.webp` : `${art}/saju-${character}-v1.webp`;
  const mobileArt = `${art}/saju-${character}-v1.webp`;
  /** 세로 그림 최애: 넓은 화면에서 그림을 통째로 왼쪽에 두고 남는 면은 공통 MediaFill 이 그 그림의 흐린 복사본으로 채운다. */
  const portrait = character !== "changha";
  const primaryLabel = entering && !again ? sceneCopy.start : talk ? text(talkChoice[talk - 1]) : null;

  const turns = (cls: string, side = false) => (
    <>
      <FanAction
        variant="neutral"
        className={side ? `${cls} ${styles.prev}` : cls}
        ariaLabel={text("prevStar")}
        leadingIcon={<FanIcon icon={ChevronLeft} />}
        onClick={() => choose(index - 1)}
      />
      <FanAction
        variant="neutral"
        className={side ? `${cls} ${styles.next}` : cls}
        ariaLabel={text("nextStar")}
        leadingIcon={<FanIcon icon={ChevronRight} />}
        onClick={() => choose(index + 1)}
      />
    </>
  );

  function renderSheets() {
    const year = chart ? yearReading(chart, now) : null;
    const month = chart ? monthReading(chart, now) : null;
    return (
      <>
        <FanDialog
          open={sheet === "login"}
          onOpenChange={(open) => !open && setSheet(null)}
          title={text("login")}
          size="sm"
          closeLabel={text("close")}
          primary={{ label: text("loginContinue"), onClick: login }}
        >
          <FanText as="p" role="body">
            <ReadingText id="sajuLogin" />
          </FanText>
        </FanDialog>
        <BirthSheet
          open={sheet === "birth"}
          mode="me"
          copy={birthCopy}
          busy={birthBusy}
          error={birthError}
          onClose={() => setSheet(null)}
          onSave={saveMyBirth}
        />
        <BirthSheet
          open={sheet === "pair"}
          mode="partner"
          copy={birthCopy}
          busy={birthBusy}
          error={birthError}
          onClose={() => setSheet(null)}
          onSave={savePair}
        />
        <FanSheet
          open={sheet === "pairPick"}
          onOpenChange={(open) => !open && setSheet(null)}
          title={text("pairPartner")}
          closeLabel={text("close")}
        >
          <div className={sheetStyles.topics}>
            {partners.map((partner) => (
              <FanAction
                key={partner.id}
                variant="text"
                className={sheetStyles.topicRow}
                onClick={() => void runPair(partner.id, partner.nickname, partner.timePrecision !== "unknown")}
              >
                <span className={sheetStyles.topicBody}>
                  <span className={sheetStyles.topicText}>
                    <FanText role="item">{partner.nickname}</FanText>
                    <FanText role="meta">{partner.birthDate.replaceAll("-", ".")}</FanText>
                  </span>
                  <FanIcon icon={ChevronRight} />
                </span>
              </FanAction>
            ))}
            <FanAction variant="text" className={sheetStyles.topicRow} onClick={() => setSheet("pair")}>
              <span className={sheetStyles.topicBody}>
                <span className={sheetStyles.topicText}>
                  <FanText role="item"><ReadingText id="newEntry" /></FanText>
                </span>
                <FanIcon icon={ChevronRight} />
              </span>
            </FanAction>
          </div>
        </FanSheet>
        <FanSheet
          open={sheet === "topics"}
          onOpenChange={(open) => !open && setSheet(null)}
          title="더 깊이"
          closeLabel={text("close")}
        >
          <div className={sheetStyles.topics}>
            <FanText as="p" role="meta">
              <ReadingText id="current" />
            </FanText>
            {year && month && (
              <>
                <FanAction variant="text" className={sheetStyles.topicRow} onClick={() => openView("year")}>
                  <span className={sheetStyles.topicBody}>
                    <span className={sheetStyles.topicText}>
                      <FanText role="item"><ReadingText id="year" /></FanText>
                      <FanText role="meta">{year.name} · {year.span.split(" · ")[0]}</FanText>
                    </span>
                    <FanText role="meta"><ReadingText id="free" /></FanText>
                  </span>
                </FanAction>
                <FanAction variant="text" className={sheetStyles.topicRow} onClick={() => openView("month")}>
                  <span className={sheetStyles.topicBody}>
                    <span className={sheetStyles.topicText}>
                      <FanText role="item"><ReadingText id="month" /></FanText>
                      <FanText role="meta">{month.span}</FanText>
                    </span>
                    <FanText role="meta"><ReadingText id="free" /></FanText>
                  </span>
                </FanAction>
              </>
            )}
            <FanText as="p" role="meta">
              <ReadingText id="together" />
            </FanText>
            <FanAction
              variant="text"
              className={sheetStyles.topicRow}
              onClick={() => {
                setSheet(null);
                void openPair();
              }}
            >
              <span className={sheetStyles.topicBody}>
                <span className={sheetStyles.topicText}>
                  <FanText role="item">궁합</FanText>
                  <FanText role="meta"><ReadingText id="dailyFree" /></FanText>
                </span>
                <FanIcon icon={ChevronRight} />
              </span>
            </FanAction>
          </div>
        </FanSheet>
      </>
    );
  }

  return (
    <div className={styles.page} data-saju-flow={step}>
      <div className={styles.chips}>
        {step === "enter" ? (
          <FanAction
            variant="neutral"
            href={back}
            ariaLabel={sceneCopy.exit}
            leadingIcon={<FanIcon icon={ChevronLeft} />}
            className={styles.round}
          />
        ) : (
          <FanAction
            variant="neutral"
            ariaLabel={sceneCopy.back}
            leadingIcon={<FanIcon icon={ChevronLeft} />}
            className={styles.round}
            onClick={() => (phase === "error" && step === "result" ? setPhase("idle") : window.history.back())}
          />
        )}
        {step === "enter" ? (
          <>
            <div className={styles.pick} role="group" aria-label={text("favorite")}>
              {sajuCharacters.map((item) => (
                <FanAction
                  key={item.id}
                  variant="text"
                  className={styles.pickItem}
                  aria-pressed={item.id === character}
                  onClick={() => choose(sajuCharacters.indexOf(item))}
                >
                  <img src={`${art}/avatar-${item.id}-v1.jpg`} alt="" />
                  <FanText role={item.id === character ? "label" : "meta"}>{item.name}</FanText>
                </FanAction>
              ))}
            </div>
            <span className={styles.turnRow}>{turns(styles.round)}</span>
          </>
        ) : (
          <>
            <FanText role="label" className={styles.nameChip}>
              {name}
            </FanText>
            {talk && (
              <FanAction variant="text" className={styles.skip} onClick={openResult}>
                <ReadingText id="skip" />
              </FanAction>
            )}
          </>
        )}
      </div>
      <div
        className={portrait ? `${styles.stage} ${mediaFillClass}` : styles.stage}
        data-portrait={portrait ? character : undefined}
      >
        {portrait && <MediaBackdrop src={wideArt} />}
        <picture className={styles.art}>
          <source media="(min-width: 48rem)" srcSet={wideArt} />
          <img src={mobileArt} alt={`${name}의 사주 장면`} />
        </picture>
        {step === "enter" && <span className={styles.turnStage}>{turns(styles.turn, true)}</span>}
        {entering && again && reading && (
          <FanAction
            variant="neutral"
            className={styles.history}
            onClick={() => openView("first")}
          >
            {sceneCopy.history}
          </FanAction>
        )}
        {phase === "error" ? (
          <div className={styles.controls}>
            <FanState
              inline
              kind={failure === "auth" ? "auth" : "error"}
              title={text(failureTitle[failure])}
              actions={
                failure === "auth" ? (
                  <FanAction onClick={login}><ReadingText id="login" /></FanAction>
                ) : (
                  <FanAction
                    onClick={() => {
                      const retry = lastPair.current;
                      if (restoreRetry.current) restoreRetry.current();
                      else if (step === "calc") void run(character);
                      else if (retry) void runPair(retry.partnerId, retry.who, retry.timeKnown);
                      else setPhase("idle");
                    }}
                  >
                    <ReadingText id="retry" />
                  </FanAction>
                )
              }
            />
          </div>
        ) : (
          <div className={styles.controls}>
            {entering && phase === "idle" && (
              <div className={styles.title}>
                <FanHeading as="h1">{sceneCopy.title}</FanHeading>
              </div>
            )}
            {phase === "limit" && (
              <FanAction variant="neutral" onClick={() => setPhase("idle")}>
                {text("return")}</FanAction>
            )}
            {entering && again && reading && phase === "idle" && (
              <div className={styles.choicesRow}>
                <FanAction variant="neutral" onClick={() => setSheet("topics")}>
                  {sceneCopy.more}
                </FanAction>
                <FanAction variant="neutral" onClick={() => void openPair()}>
                  {sceneCopy.match}
                </FanAction>
              </div>
            )}
            {primaryLabel && phase === "idle" && (
              <div className={styles.choices}>
                {entering && (
                  <FanAction variant="neutral" href={back}>
                    {sceneCopy.later}
                  </FanAction>
                )}
                <FanAction
                  variant="primary"
                  disabled={entering && (!ready || (authenticated && firsts === null))}
                  onClick={() => (entering ? start() : advance())}
                >
                  {primaryLabel}
                </FanAction>
              </div>
            )}
            <section className={styles.dialog} aria-live="polite">
              <p className={styles.who} data-face={talk ? "" : undefined}>
                {talk && <img className={styles.face} src={`${art}/avatar-${character}-v1.jpg`} alt="" />}
                <FanText as="strong" role="item">
                  {name}
                </FanText>
                {talk && <FanText role="meta">{talk}/4</FanText>}
              </p>
              <FanText as="p" role="body">
                {line}
                {(step === "calc" || phase === "pairCalc") && (
                  <span className={styles.dots} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </FanText>
            </section>
          </div>
        )}
      </div>
      {renderSheets()}
    </div>
  );
}
