"use client";

/**
 * 케미 질문하기(사주·운세·별자리·타로 결과에서 진입). 주제 고르기 → 질문 쓰기 → 최애 답 → 이어 묻기 1번.
 * 화면 전체가 장면이다: 최애 그림(가로 화면은 반복 영상)이 배경을 채우고, 아래 대화 상자 하나에 최애의 말과 선택지가 함께 놓인다.
 * 최애가 말을 마친 뒤에 선택지가 나타나고, 답은 한 쪽씩 넘긴다(기획 03-6 07). 답을 다 들으면 짧은 반응을 고를 수 있고,
 * 오늘 마지막 질문을 마치면 최애가 작별 인사로 대화를 맺는다.
 * 남은 질문 수·차감·한도는 서버(/api/chemi/ask)가 정하고, 이 화면은 받은 값만 그린다.
 * 유료 구매 자리는 결제 수단이 붙기 전이라 두지 않는다.
 */
import { SceneSound } from "@/features/chemi/ui/scene-sound";
import { expressionFor, SceneExpression } from "@/features/chemi/ui/scene-expression";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import {
  ArrowUp,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Coins,
  Heart,
  History,
  Mail,
  MessageCircle,
  Phone,
  RotateCcw,
  Share2,
  Sparkles,
  UsersRound,
  X,
} from "@/components/fan-ui/fan-icons";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { ExtraPlayDialog } from "@/features/chemi/ui/extra-play-dialog";
import { RollingNumber } from "@/components/fan-ui/rolling-number";
import { ReadingTitle, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { showShareReward } from "@/features/chemi/i18n/share-reward";
import type { AppLocale } from "@/i18n/locales";
import { creatorName } from "@/features/fanpage/domain/creator-names";
import {
  askArt, askExamples, askFollowups, askLinesFor, askLoop, askPages, askReaction, askReactionExpression, askRecall, askResultExamples, askResultLine,
  askSubject, askVoice,
  ASK_REACTIONS, ASK_RECALLS, ASK_TOPICS,
  type AskCharacter, type AskContent, type AskRecall, type AskTopic,
} from "./lines";
import { askBack, askGo, type AskLocation } from "./location";
import { SceneBackdrop } from "./scene-backdrop";
import { canType, TypedLine } from "./typed-line";
import styles from "./ask.module.css";

type Thread = {
  threadId: string;
  character: AskCharacter;
  content: AskContent;
  readingId: string | null;
  topic: AskTopic | null;
  question: string;
  status: "answered" | "blocked";
  klass: string | null;
  answer: string;
  followupQuestion: string | null;
  followupAnswer: string | null;
  date: string;
  createdAt?: string;
};
type AskState = {
  left: number;
  /** 무료·이용권을 다 쓴 뒤 포인트로 더 물을 수 있는 수와 값, 지금 잔액(chemi_ask_state). */
  extraLeft?: number;
  extraCost?: number;
  points?: number;
  shareBonus: { pass: boolean; exp: boolean };
  reminded: boolean;
  pausedUntil: string | null;
  threads: Thread[];
};
/** 보내는 중이거나 답을 못 받은 질문. 같은 번호로 다시 보내면 서버가 한 번만 센다. */
type Draft = { threadId: string; topic: AskTopic | null; question: string; failed: boolean; followOf?: string };

const topicIcon = { love: Heart, work: BriefcaseBusiness, money: Coins, people: UsersRound, month: CalendarDays, free: Sparkles } as const;
const topicKey = {
  love: "askTopicLove", work: "askTopicWork", money: "askTopicMoney", people: "askTopicPeople", month: "askTopicMonth", free: "askTopicFree",
} as const;

/** 가로 화면(1024px 이상)인지. 답 한 쪽에 담는 글자 수가 달라진다. */
const WIDE = "(min-width: 64rem)";
function watchWide(notify: () => void) {
  const query = matchMedia(WIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/** 질문 글자 수(기획 03-6 22·23). 서버 routes.ts ASK_QUESTION_MAX 와 같다. 이 수부터 글자 수가 분홍이 된다. */
const QUESTION_MAX = 200;
const QUESTION_WARN = 180;
/** 이 시간 안에 답이 오지 않으면 실패로 본다(기획 03-6 16). 서버가 잡아 둔 질문은 같은 번호로 다시 보내면 한 번만 센다. */
const SEND_TIMEOUT_MS = 20_000;
const contentTitle = { saju: "saju", fortune: "fortune", star: "zodiac", tarot: "tarot" } as const;
type Evidence = { rows: { kind: "basis" | "why"; text: string }[]; hourless: boolean };

const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now());
const shortDate = (day: string) => `${day.slice(5, 7)}. ${day.slice(8, 10)}.`;

export function AskScene({ locale, content, character, readingId, at, result }: {
  locale: AppLocale;
  content: AskContent;
  character: AskCharacter;
  readingId: string;
  at: AskLocation;
  /** 결과 화면에서 온 질문의 '이 결과' 칩 뒤에 붙는 결과 이름(예: 82점). */
  result?: string;
}) {
  const text = useReadingCopy();
  const { ready, getAccessToken } = useByUsAuth();
  const [state, setState] = useState<AskState | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [blocked, setBlocked] = useState<Thread | null>(null);
  const [input, setInput] = useState("");
  const [sheet, setSheet] = useState<"history" | "share" | "extra" | null>(null);
  // 포인트로 하나 더 묻기로 한 뒤 다음 질문 하나에만 켠다. 답을 받거나 실패하면 끈다.
  const [extra, setExtra] = useState(false);
  const [busy, setBusy] = useState<"remind" | "share" | null>(null);
  const [thanked, setThanked] = useState(false);
  // 방금 받은 답(질문 번호, 이어 물은 답이면 :follow)만 글자가 하나씩 나온다. 지난 질문을 다시 열면 바로 보인다.
  const [fresh, setFresh] = useState<string | null>(null);
  // 답의 몇 번째 쪽을 보고 있는지. 질문이 바뀌면 처음으로 돌아간다.
  const [page, setPage] = useState({ of: "", index: 0 });
  // 최애가 말을 마친 줄. 그 줄의 선택지는 이때부터 보인다.
  const [said, setSaid] = useState("");
  // 다른 날 다시 왔을 때 지난 질문이 어떻게 됐는지 고른 답. 고르기 전에는 최애가 먼저 묻는다.
  const [recall, setRecall] = useState<AskRecall | null>(null);
  const wide = useSyncExternalStore(watchWide, () => matchMedia(WIDE).matches, () => false);
  const field = useRef<HTMLTextAreaElement>(null);
  // 답 아래 '내 풀이 근거': 펼친 질문 번호와 받아 온 값. 펼칠 때 한 번만 읽는다.
  const [opened, setOpened] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<string, Evidence | "failed">>({});
  const panelBox = useRef<HTMLDivElement>(null);

  // 390 에서 토스트가 대화판과 버튼을 덮지 않게, 대화판 높이를 알려 토스트를 그 위에 띄운다.
  useEffect(() => {
    const box = panelBox.current;
    if (!box) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--chemi-ask-panel", `${box.offsetHeight}px`));
    observer.observe(box);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--chemi-ask-panel");
    };
  }, []);

  const shown =
    at.step === "answer" || at.step === "follow"
      ? (blocked?.threadId === at.thread ? blocked : state?.threads.find((item) => item.threadId === at.thread)) ?? null
      : null;
  // 지난 질문을 열면 그 질문을 받은 최애와 그 장면으로 답한다(다른 최애의 답을 지금 최애가 대신 말하지 않는다).
  // 답을 들은 뒤 고른 반응은 주소에 있다(서버에 보내지 않는다). 이어 묻기에서 그 반응에 맞는 말이 먼저 놓인다.
  const picked = at.step === "answer" || at.step === "follow" ? at.react ?? null : null;
  const who = shown?.character ?? character;
  const where = shown?.content ?? content;
  const name = creatorName(who, locale);
  const lines = askLinesFor(who);
  const art = askArt(where, who);
  // 토큰 함수가 그릴 때마다 새로 만들어져도 상태를 다시 읽지 않게 최신 함수만 기억해 둔다.
  const token = useRef(getAccessToken);
  useLayoutEffect(() => {
    token.current = getAccessToken;
  });
  const headers = useCallback(async () => ({ Authorization: `Bearer ${await token.current()}`, "Content-Type": "application/json" }), []);

  // 로그인 확인이 끝난 뒤에 읽는다. 로그인이 풀려 있으면 서버가 거절하고 다시 시도 안내가 뜬다.
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void (async () => {
      const response = await fetch(`/api/chemi/ask?r=${readingId}&c=${character}`, { headers: await headers(), signal: controller.signal });
      if (!response.ok) throw Error("load");
      setState((await response.json()) as AskState);
      setFailed(false);
    })().catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, [ready, readingId, character, headers, attempt]);

  // 주제를 바꾸거나 칩을 지워도 쓰던 글은 그대로 둔다(기획 03-6 24·33). 답을 받으면 비운다.
  const topic = at.step === "write" ? at.topic : at.step === "result" ? "free" : null;

  async function send(next: Draft) {
    setDraft({ ...next, failed: false });
    setBlocked(null);
    try {
      const response = await fetch(next.followOf ? "/api/chemi/ask/followup" : "/api/chemi/ask", {
        method: "POST",
        headers: await headers(),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        body: JSON.stringify(
          next.followOf
            ? { threadId: next.followOf, question: next.question }
            : { threadId: next.threadId, readingId, character, content, topic: next.topic, question: next.question, ...(extra ? { extra: true } : {}) },
        ),
      });
      const body = (await response.json()) as { thread?: Thread; state?: AskState; blocked?: { klass: string; answer: string }; error?: { code: string } };
      if (response.status === 409 && (body.error?.code === "CHEMI_LIMIT" || body.error?.code === "INSUFFICIENT_POINTS")) {
        if (body.error.code === "INSUFFICIENT_POINTS") showFanToast({ title: text("askExtraShort"), tone: "error" });
        setExtra(false);
        setDraft(null);
        setAttempt((value) => value + 1);
        return askGo({ step: "topic" }, "replace");
      }
      if (!response.ok) throw Error(body.error?.code ?? "send");
      if (body.state) setState(body.state);
      setExtra(false);
      setDraft(null);
      setInput("");
      if (body.blocked) {
        // 이어 묻기가 난감한 질문이면 답만 보여 주고 이어 묻기 1번은 그대로 남는다.
        setBlocked({
          threadId: next.threadId, character, content, readingId, topic: null, question: next.question, status: "blocked",
          klass: body.blocked.klass, answer: body.blocked.answer, followupQuestion: null, followupAnswer: null, date: kstToday(),
        });
        setFresh(next.threadId);
        return askGo({ step: "answer", thread: next.threadId }, "replace");
      }
      if (body.thread?.status === "blocked") setBlocked(body.thread);
      setFresh(next.followOf ? `${next.followOf}:follow` : next.threadId);
      setPage({ of: "", index: 0 });
      askGo({ step: "answer", thread: next.followOf ?? next.threadId }, next.followOf ? "replace" : "push");
    } catch {
      // 끊김은 토스트로만 알리고 최애의 대사 자리는 비운다(기획 03-6 16). 쓰던 질문은 그대로 둔다.
      setDraft({ ...next, failed: true });
      setInput(next.question);
      showFanToast({ title: text("askError"), tone: "error" });
    }
  }

  async function openEvidence(threadId: string) {
    setOpened((value) => (value === threadId ? null : threadId));
    if (evidence[threadId] && evidence[threadId] !== "failed") return;
    try {
      const response = await fetch(`/api/chemi/ask/evidence?t=${threadId}`, { headers: await headers() });
      if (!response.ok) throw Error("evidence");
      const body = (await response.json()) as Evidence;
      setEvidence((value) => ({ ...value, [threadId]: body }));
    } catch {
      setEvidence((value) => ({ ...value, [threadId]: "failed" }));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || draft) return;
    void send({
      threadId: crypto.randomUUID(),
      topic,
      question,
      failed: false,
      followOf: at.step === "follow" ? at.thread : undefined,
    });
  }

  async function remind() {
    setBusy("remind");
    try {
      const response = await fetch("/api/chemi/reminders", { method: "POST", headers: await headers(), body: JSON.stringify({ kind: "free_ask", content: "" }) });
      if (response.ok) setState((value) => value && { ...value, reminded: true });
      else {
        const code = ((await response.json()) as { error?: { code?: string } }).error?.code;
        showFanToast({ title: text(code === "CHEMI_MAIL_UNVERIFIED" ? "askRemindNoMail" : "askRemindFailed"), tone: "error" });
      }
    } catch {
      showFanToast({ title: text("askRemindFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  /** 공유 링크를 만들어 복사하거나(copy) 기기 공유창으로 보낸다(send). 보상은 서버가 준 만큼만 알린다. */
  async function share(via: "copy" | "send") {
    setBusy("share");
    try {
      const authorization = await headers();
      const created = await fetch("/api/chemi/shares", { method: "POST", headers: authorization, body: JSON.stringify({ readingId, character }) });
      if (!created.ok) throw Error("share");
      const card = (await created.json()) as { shareId: string; url: string };
      const href = new URL(card.url, location.origin).toString();
      if (via === "send") await navigator.share({ url: href });
      else await navigator.clipboard.writeText(href);
      const done = await fetch(`/api/chemi/shares/${encodeURIComponent(card.shareId)}/done`, { method: "POST", headers: authorization, body: JSON.stringify({ via }) });
      // 받은 것이 있으면 그것만 알린다. 없을 때만 복사했다고 알린다.
      const rewarded = await showShareReward(done, text, name);
      if (!rewarded && via === "copy") showFanToast({ title: text("copyDone"), tone: "success" });
      setSheet(null);
      setThanked(true);
      setAttempt((value) => value + 1);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) showFanToast({ title: text("copyFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  const open = (thread: Thread) => {
    setSheet(null);
    setDraft(null);
    setFresh(null);
    askGo({ step: "answer", thread: thread.threadId });
  };
  const again = () => {
    setDraft(null);
    setBlocked(null);
    askGo({ step: "topic" });
  };

  // 답을 찾지 못하는 번호(지워졌거나 남의 것)로 열렸으면 주제 고르기로 돌린다.
  const lost = Boolean(state) && !draft && (at.step === "answer" || at.step === "follow") && !shown;
  useEffect(() => {
    if (lost) askGo({ step: "topic" }, "replace");
  }, [lost]);

  const empty = state?.left === 0 && !extra;
  const today = kstToday();
  const todays = state?.threads.filter((item) => item.date === today) ?? [];
  const historyDate = (item: Thread) => {
    const timestamp = item.createdAt ? new Date(item.createdAt) : null;
    if (timestamp && Number.isFinite(timestamp.getTime())) {
      const time = new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit",
      }).format(timestamp);
      return item.date === today ? time : `${shortDate(item.date)} · ${time}`;
    }
    const matches = state?.threads.filter((thread) => thread.date === item.date && thread.question === item.question) ?? [];
    const order = matches.length - matches.findIndex((thread) => thread.threadId === item.threadId);
    return matches.length > 1 ? `${shortDate(item.date)} · #${order}` : shortDate(item.date);
  };
  const historyRow = (item: Thread, placement: "today" | "side" | "sheet") => {
    const current = placement === "side" && item.threadId === shown?.threadId;
    const preview = item.answer?.trim().split(/\r?\n/, 1)[0]?.match(/^.*?(?:[!?。！？]+|\.(?!\d)|$)/u)?.[0];
    return (
      <li key={item.threadId} data-row="" data-current={current ? "" : undefined}>
        <FanAction variant="text" className={styles.rowLink} aria-current={current ? "true" : undefined} onClick={() => open(item)}>
          <span className={`${styles.rowGrid} ${styles.histRow}`}>
            <img className={placement === "sheet" ? styles.face : styles.faceSmall}
              src={askArt(item.content, item.character).face} alt={creatorName(item.character, locale)} />
            <span className={styles.histText}>
              <FanText role="item" className={styles.clip}>{item.question}</FanText>
              <FanText role="meta" className={styles.clip}>{preview}</FanText>
              {placement !== "today" ? (
                <FanText role="meta">
                  {historyDate(item)}
                  {placement === "side" ? ` · ${creatorName(item.character, locale)}` : item.topic ? ` · ${text(topicKey[item.topic])}` : ""}
                  {item.followupAnswer ? "" : ` · ${text("askFollow")} ${text("askFollowOnce")}`}
                </FanText>
              ) : null}
            </span>
            {placement !== "side" ? <FanIcon icon={ChevronRight} size={16} /> : null}
          </span>
        </FanAction>
      </li>
    );
  };
  // 이 최애와 이야기한 날 수(오늘 포함). 서버가 최근 30개만 주므로 30개가 찼으면 세지 않는다.
  const days = state && state.threads.length < 30
    ? new Set([...state.threads.filter((item) => item.character === character).map((item) => item.date), today]).size
    : 0;
  const bonus = state?.shareBonus ?? { pass: false, exp: false };
  const canSend = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareAction = (
    <FanAction variant="text" className={styles.cell} leadingIcon={<FanIcon icon={Share2} />} onClick={() => setSheet("share")}>
      {text("share")}
      {bonus.pass ? <FanTag tone="neutral">+1</FanTag> : null}
    </FanAction>
  );
  // 오늘 질문을 다 썼을 때의 행동: 내일 알림을 신청하고, 신청했으면 자랑하기가 주 버튼이 된다(소진 화면과 오늘 마지막 답이 함께 쓴다).
  // 무료·이용권을 다 쓴 화면의 주 버튼: 포인트로 하나 더 물을 수 있으면 그것, 아니면 알림·자랑하기(사용자 결정 CHEMI-ASK-POINTS-1123 A).
  const extraCost = state?.extraCost ?? 0;
  const extraMain = () =>
    state && (state.extraLeft ?? 0) > 0 && extraCost > 0
      ? { label: text("askExtraCta", { cost: extraCost }), icon: Coins, onClick: () => setSheet("extra") }
      : null;
  const restMain = () =>
    state?.reminded
      ? { label: text("share"), icon: Share2, tag: bonus.pass ? text("shareQuestionBonus") : undefined, onClick: () => setSheet("share") }
      : { label: text("askRemind"), icon: Mail, loading: busy === "remind", onClick: () => void remind() };
  const reminded = (
    <span className={styles.status}>
      <FanIcon icon={Check} size={16} />
      <FanText role="label">{text("askReminded")}</FanText>
    </span>
  );
  // 지금 장면: 단계·질문이 바뀌면 대화 상자가 새로 등장한다.
  const view = failed
    ? "failed"
    : !state
      ? "loading"
      : draft
        ? `draft:${draft.threadId}:${draft.failed}`
        : state.pausedUntil
          ? "paused"
          : shown && (at.step === "answer" || at.step === "follow")
            ? `${at.step}:${shown.threadId}`
            : empty
              ? "empty"
              : at.step === "write"
                ? `write:${at.topic}`
                : at.step === "result"
                  ? "write:result"
                  : "topic";
  const speak = (body: React.ReactNode, meta?: React.ReactNode) => (
    <div className={styles.speak}>
      <img className={styles.face} src={art.face} alt="" />
      <div className={styles.speakBody}>
        <p className={styles.who}>
          <FanText role="item">{name}</FanText>
          {typeof meta === "string" ? <FanText role="meta">{meta}</FanText> : meta}
        </p>
        {body}
      </div>
    </div>
  );
  /** 최애의 한 줄. typing 이면 글자가 하나씩 나오고, 다 나오면 이 줄의 선택지가 보인다. */
  const lineKey = (body: string) => `${view}|${body}`;
  /** 그 줄을 다 말했는지: 글자가 하나씩 나오는 줄이 아니면 처음부터 다 말한 것이다. */
  const saidAll = (body: string, typing: boolean) => !typing || !canType() || said === lineKey(body);
  const line = (body: string, typing: boolean) => (
    <TypedLine key={lineKey(body)} text={body} typing={typing && said !== lineKey(body)} onDone={() => setSaid(lineKey(body))} />
  );
  const quoted = (question: string, tag: AskTopic | null) => (
    <div className={styles.mineRow}>
      {tag && tag !== "free" ? <FanTag tone="neutral">{text(topicKey[tag])}</FanTag> : null}
      <FanText as="p" role="body" className={styles.mine}>{question}</FanText>
    </div>
  );
  // 입력 판: 긴 질문은 여러 줄로 늘어나고, 글자 수는 180자부터 분홍, 200자에서 더 써지지 않는다(기획 03-6 22·23).
  // Enter 는 보내기, Shift+Enter 는 줄 바꿈. 한글 조합 중의 Enter 는 보내지 않는다.
  const composer = (chip?: React.ReactNode) => (
    <form className={styles.composer} onSubmit={submit}>
      {chip}
      <textarea
        ref={field}
        className={styles.field}
        value={input}
        rows={1}
        maxLength={QUESTION_MAX}
        enterKeyHint="send"
        aria-label={text("askInput")}
        placeholder={text("askInput")}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className={styles.sendRow}>
        <FanText role="meta" className={styles.counter} data-warn={input.length >= QUESTION_WARN ? "" : undefined} aria-live="polite">
          {`${input.length}/${QUESTION_MAX}`}
        </FanText>
        <FanIconButton type="submit" className={styles.send} aria-label={text("send")} disabled={!input.trim()}>
          <FanIcon icon={ArrowUp} />
        </FanIconButton>
      </div>
    </form>
  );

  let panel: React.ReactNode;
  // 화면의 주 버튼은 하나: 상태마다 내용만 바꿔 한 자리에 그린다.
  let main: { label: string; onClick: () => void; icon?: typeof Mail; tag?: string; loading?: boolean } | null = null;
  let below: React.ReactNode = null;
  // 최애가 말을 마쳐야 선택지가 보인다. 자리는 미리 잡아 두어 대화 상자가 밀리지 않는다.
  let spoken = true;
  /** 답의 다음 쪽이 남아 있는 동안: 행동 줄은 마지막 쪽에서만 자리를 잡는다(앞쪽에 빈 칸을 남기지 않는다). */
  let paging = false;
  // 오늘 마지막 질문의 답을 보고 있는지: 장면이 저녁처럼 조금 어두워진다.
  let ending = false;
  // 지금 쪽이 팬이 고른 반응에 최애가 답하는 쪽인지: 그 반응에 맞는 표정으로 바뀐다.
  let reacting = false;
  if (failed)
    panel = (
      <section className={styles.talk}>
        <FanState kind="error" title={text("askLoadFailed")} actions={<FanAction size="sm" onClick={() => setAttempt((value) => value + 1)}>{text("retry")}</FanAction>} />
      </section>
    );
  else if (!state)
    panel = (
      <section className={styles.talk} aria-busy="true">
        {speak(<FanSkeleton width="70%" />)}
      </section>
    );
  else if (draft) {
    panel = (
      <>
        <section className={`${styles.talk} ${styles.thread}`} aria-live="polite" aria-busy={!draft.failed}>
          {quoted(draft.question, draft.topic)}
          {/* 끊겼으면 최애의 대사 상자는 숨기고 토스트로만 알린다(기획 03-6 16). */}
          {draft.failed ? null : speak(
            <>
              {line(lines.think(askSubject[where]), true)}
              <span className={styles.dots} role="status" aria-label={text("askWriting", { name })}>
                <i />
                <i />
                <i />
              </span>
            </>,
          )}
        </section>
      </>
    );
    if (draft.failed) {
      main = { label: text("askResend"), icon: RotateCcw, onClick: () => void send(draft) };
      below = (
        <div className={styles.row} data-single="">
          <FanAction variant="text" className={styles.cell} onClick={() => {
              setDraft(null);
              askGo(
                draft.followOf ? { step: "follow", thread: draft.followOf }
                  : draft.topic && draft.topic !== "free" ? { step: "write", topic: draft.topic } : { step: "topic" },
                "replace",
              );
            }}>
            {text("later")}
          </FanAction>
        </div>
      );
    }
  }
  else if (state.pausedUntil)
    panel = (
      <section className={styles.talk}>
        <p className={styles.sys} role="status">
          <FanIcon icon={CircleAlert} />
          <FanText role="body">
            {text("askPaused", { time: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(state.pausedUntil)) })}
          </FanText>
        </p>
      </section>
    );
  else if (shown && at.step === "answer" && shown.klass === "crisis") {
    // 위기 신호: 최애의 말투·이름표·남은 수 없이 흰 판에 도움 전화만(기획 03-6 27). 한국어 화면이 아니면 나라별 상담 전화 찾기.
    panel = (
      <section className={styles.crisis} role="alert">
        <FanText as="strong" role="item">{text("askCrisisTitle")}</FanText>
        <FanText as="p" role="body">{text("askCrisisBody")}</FanText>
        {locale === "ko" ? (
          <div className={styles.calls}>
            {([["askCrisis109", "109"], ["askCrisis1388", "1388"]] as const).map(([label, number]) => (
              <FanAction key={number} href={`tel:${number}`} variant="neutral" fullWidth className={styles.call} leadingIcon={<FanIcon icon={Phone} />}>
                <span className={styles.callText}>
                  <FanText role="label">{text(label)}</FanText>
                  <FanText as="strong" role="item">{number}</FanText>
                </span>
              </FanAction>
            ))}
          </div>
        ) : (
          <FanAction href="https://findahelpline.com" external leadingIcon={<FanIcon icon={Phone} />}>{text("askCrisisAbroad")}</FanAction>
        )}
        <FanAction variant="text" onClick={again}>{text("close")}</FanAction>
      </section>
    );
  }
  else if (shown && at.step === "answer" && shown.klass === "service") {
    // 질문 수·가격 질문: 최애가 대사로 받지 않고 앱 안내 한 줄로 답한다(기획 12-3). 질문 수는 그대로다.
    panel = (
      <section className={`${styles.talk} ${styles.thread}`} aria-live="polite">
        {quoted(shown.question, null)}
        <p className={styles.sys} role="status">
          <FanIcon icon={MessageCircle} />
          <FanText role="body">{shown.answer}</FanText>
        </p>
      </section>
    );
    main = { label: text("askOtherAfterGuard"), onClick: again };
  }
  else if (shown && at.step === "answer") {
    // 답은 한 쪽씩. 이어 물은 답이 있으면 그 질문과 답이 뒤에 이어지고, 반응을 고르면 그 말과 최애의 한 마디가 붙는다.
    const guarded = shown.status === "blocked";
    // 실제 인물·사생활 질문은 내 연애 질문으로, 무관·메타 질문은 이 풀이의 질문으로 돌린다. 괴롭힘·남의 사주는 돌리지 않는다.
    const redirect = !guarded || state.left === 0 ? null
      : shown.klass === "privacy" ? { examples: askExamples("love", who).slice(0, 2), to: { step: "write", topic: "love" } as const }
      : shown.klass === "off_topic" || shown.klass === "prompt" ? { examples: askResultExamples(where, who, today).slice(0, 2), to: { step: "result" } as const }
      : null;
    const threadId = shown.threadId;
    const complete = Boolean(shown.followupAnswer);
    ending = !guarded && state.left === 0 && shown.date === today;
    const arrived = fresh?.startsWith(threadId) ?? false;
    // 이어 물은 답이 오면 주소의 반응이 지워져, 그 답에 새로 반응할 수 있다.
    const react = picked;
    const beats: { question: string | null; tag: AskTopic | null; body: string; key: string }[] = [
      ...askPages(shown.answer, wide).map((body) => ({ question: shown.question, tag: guarded ? null : shown.topic, body, key: threadId })),
      ...(shown.followupQuestion && shown.followupAnswer
        ? askPages(shown.followupAnswer, wide).map((body) => ({ question: shown.followupQuestion, tag: null, body, key: `${threadId}:follow` }))
        : []),
      ...(react ? [{ question: askReaction(react, who), tag: null, body: lines.react[react], key: `${threadId}:react` }] : []),
      // 오늘 마지막 질문을 이어 묻기까지 다 썼으면 방금 받은 답 뒤에 작별 인사가 한 쪽 붙는다. 내일 알림을 신청하면 그 대답으로 바뀐다.
      ...(ending && complete && arrived ? [{ question: null, tag: null, body: state.reminded ? lines.reminded : lines.rest[where], key: `${threadId}:rest` }] : []),
    ];
    const start = fresh === `${threadId}:follow` ? Math.max(0, beats.findIndex((item) => item.key === fresh)) : 0;
    const index = Math.min(page.of === view ? page.index : start, beats.length - 1);
    const beat = beats[index];
    const last = index === beats.length - 1;
    const farewell = beat.key === `${threadId}:rest`;
    const typing = fresh === beat.key || farewell;
    reacting = beat.key === `${threadId}:react`;
    const settled = saidAll(beat.body, typing);
    const forward = () => {
      if (!settled) setSaid(lineKey(beat.body));
      else if (!last) setPage({ of: view, index: index + 1 });
    };
    // 몇 쪽째인지는 이름 줄 오른쪽에: 다음 쪽이 있으면 누르는 버튼, 마지막 쪽이면 글자만.
    const pager =
      beats.length === 1 ? null : last ? (
        <FanText role="meta">{`${index + 1}/${beats.length}`}</FanText>
      ) : (
        <FanAction
          variant="text"
          size="sm"
          className={styles.pager}
          ariaLabel={`${text("next")} ${index + 1}/${beats.length}`}
          trailingIcon={<FanIcon icon={ChevronDown} size={16} />}
          onClick={(event) => {
            event.stopPropagation();
            forward();
          }}
        >
          {`${index + 1}/${beats.length}`}
        </FanAction>
      );
    spoken = last && settled;
    paging = !last;
    panel = (
      <>
        <section className={`${styles.talk} ${styles.turn}`} aria-live="polite" onClick={forward}>
          {beat.question ? quoted(beat.question, beat.tag) : null}
          {speak(line(beat.body, typing), guarded ? text("askKept") : pager)}
          {guarded && pager ? <div className={styles.pagerRow}>{pager}</div> : null}
          {!guarded && last ? (
            <div className={styles.basis} onClick={(event) => event.stopPropagation()}>
              <FanAction
                variant="text"
                size="sm"
                className={styles.basisToggle}
                aria-expanded={opened === threadId}
                trailingIcon={<FanIcon icon={opened === threadId ? ChevronUp : ChevronDown} size={16} />}
                onClick={() => void openEvidence(threadId)}
              >
                {text("askEvidence")}
              </FanAction>
              {opened === threadId ? (
                evidence[threadId] === "failed" ? (
                  <FanText as="p" role="meta">{text("askLoadFailed")}</FanText>
                ) : evidence[threadId] ? (
                  <dl className={styles.basisList}>
                    {(evidence[threadId] as Evidence).rows.map((row) => (
                      <div key={row.kind}>
                        <dt><FanText role="meta">{text(row.kind === "basis" ? "askEvidenceBasis" : "askEvidenceWhy")}</FanText></dt>
                        <dd><FanText role="body">{row.text}</FanText></dd>
                      </div>
                    ))}
                    {(evidence[threadId] as Evidence).hourless ? <FanText as="p" role="meta">{text("askEvidenceHourless")}</FanText> : null}
                  </dl>
                ) : (
                  <FanSkeleton width="80%" />
                )
              ) : null}
              <FanText as="p" role="meta" className={styles.note}>{text("outlookNote")}</FanText>
            </div>
          ) : null}
        </section>
        {/* 무관·메타·실제 인물 질문 뒤에는 이 풀이로 답할 수 있는 질문 두 개를 고르게 한다. 누르면 입력 판에 들어가고 바로 보내지 않는다(기획 03-6 29·30·32, DF-ASK-015). */}
        {last && redirect ? (
          <div className={`${styles.choices} ${styles.examples} ${styles.reveal}`} data-shown={spoken ? "" : undefined} role="group" aria-label={text("askExamples")}>
            {redirect.examples.map((example) => (
              <FanAction
                key={example}
                variant="text"
                className={styles.line}
                onClick={() => {
                  setBlocked(null);
                  setInput(example);
                  askGo(redirect.to);
                }}
              >
                {example}
              </FanAction>
            ))}
          </div>
        ) : null}
        {last && !guarded && !react && !farewell ? (
          <div className={`${styles.replies} ${styles.reveal}`} data-shown={spoken ? "" : undefined}>
            {ASK_REACTIONS.map((kind) => (
              <FanAction
                key={kind}
                size="sm"
                className={styles.reply}
                onClick={() => {
                  askGo({ step: "answer", thread: threadId, react: kind }, "replace");
                  setFresh(`${threadId}:react`);
                  setPage({ of: view, index: beats.length });
                }}
              >
                {askReaction(kind, who)}
              </FanAction>
            ))}
          </div>
        ) : null}
      </>
    );
    const remindAction = state.reminded ? null : (
      <FanAction variant="text" className={styles.cell} leadingIcon={<FanIcon icon={Mail} />} loading={busy === "remind"} onClick={() => void remind()}>
        {text("askRemind")}
      </FanAction>
    );
    if (guarded) main = { label: text("askOtherAfterGuard"), onClick: again };
    else if (complete) {
      // 오늘 질문이 남아 있으면 다른 질문으로, 다 썼으면 갈 곳이 없으니 내일 알림을 주 버튼으로 둔다.
      main = ending ? extraMain() ?? restMain() : { label: text("askOther"), onClick: again };
      below = <div className={styles.row} data-single="">{ending && state.reminded ? reminded : shareAction}</div>;
    } else {
      main = { label: text("askFollow"), tag: text("askFollowOnce"), onClick: () => askGo({ step: "follow", thread: threadId, react: react ?? undefined }) };
      const other = ending ? remindAction : <FanAction variant="text" className={styles.cell} onClick={again}>{text("askOther")}</FanAction>;
      below = (
        <div className={styles.row} data-single={other ? undefined : ""}>
          {other}
          {shareAction}
        </div>
      );
    }
  }
  else if (shown && at.step === "follow")
    panel = (
      <>
        <section className={styles.talk} aria-live="polite" onClick={() => setSaid(lineKey(lines.follow))}>
          {speak(line(lines.follow, true), shown.topic ? text(topicKey[shown.topic]) : undefined)}
        </section>
        <div className={`${styles.choices} ${styles.examples} ${styles.reveal}`} data-shown={saidAll(lines.follow, true) ? "" : undefined} role="group" aria-label={text("askExamples")}>
          {askFollowups(who, picked).map((example) => (
            <FanAction
              key={example}
              variant="text"
              className={styles.line}
              aria-pressed={input === example}
              onClick={() => {
                setInput(example);
                field.current?.focus();
              }}
            >
              {example}
            </FanAction>
          ))}
        </div>
        {composer()}
      </>
    );
  else if (empty) {
    panel = (
      <>
        <section className={`${styles.talk} ${styles.thread}`} aria-live="polite">
          <p className={styles.sys} role="status">
            <FanIcon icon={CircleAlert} />
            <FanText role="item">{text("askLimit")}</FanText>
          </p>
          {speak(<FanText as="p" role="body">{state.reminded ? lines.reminded : lines.rest[content]}</FanText>)}
          {todays.length ? (
            <div className={styles.todays}>
              <FanText as="p" role="label">{text("askToday")}</FanText>
              <ul className={styles.list}>
                {todays.map((item) => historyRow(item, "today"))}
              </ul>
            </div>
          ) : null}
        </section>
      </>
    );
    const paid = extraMain();
    main = paid ?? restMain();
    // 포인트로 더 물을 수 있으면 자랑하기가 주 버튼 옆(아래 줄)에, 알림은 그 옆에 남는다.
    below = paid ? (
      <div className={styles.row}>
        {state.reminded ? reminded : <FanAction variant="text" className={styles.cell} leadingIcon={<FanIcon icon={Mail} />} loading={busy === "remind"} onClick={() => void remind()}>{text("askRemind")}</FanAction>}
        {shareAction}
      </div>
    ) : <div className={styles.row} data-single="">{state.reminded ? reminded : shareAction}</div>;
  }
  else if (at.step === "write" || at.step === "result") {
    // 질문 쓰기: 주제를 골라 왔으면 주제 칩, 결과 화면에서 왔으면 '이 결과' 칩(기획 03-6 23·24·33). ×는 1단계로, 쓰던 글은 그대로.
    const said = at.step === "write" ? lines.reask[at.topic] : askResultLine(where, who);
    const examples = at.step === "write" ? askExamples(at.topic, character) : askResultExamples(where, who, today);
    const chip = (
      <span className={styles.chip}>
        {at.step === "result" ? (
          <>
            <FanText role="label" className={styles.chipLead}>{text("askResultChip")}</FanText>
            <FanText role="label" className={styles.clip}>
              <ReadingTitle id={contentTitle[where]} />
              {result ? ` · ${result}` : ""}
            </FanText>
          </>
        ) : (
          <FanText role="label">{text(topicKey[at.topic])}</FanText>
        )}
        <FanIconButton className={styles.chipClear} aria-label={text("askResultClear")} onClick={() => askGo({ step: "topic" }, "replace")}>
          <FanIcon icon={X} size={16} />
        </FanIconButton>
      </span>
    );
    panel = (
      <>
        <section className={styles.talk} aria-live="polite" onClick={() => setSaid(lineKey(said))}>
          {speak(line(said, true))}
        </section>
        <div className={`${styles.choices} ${styles.examples} ${styles.reveal}`} data-shown={saidAll(said, true) ? "" : undefined} role="group" aria-label={text("askExamples")}>
          {examples.map((example) => (
            <FanAction
              key={example}
              variant="text"
              className={styles.line}
              aria-pressed={input === example}
              onClick={() => {
                setInput(example);
                field.current?.focus();
              }}
            >
              {example}
            </FanAction>
          ))}
        </div>
        {composer(chip)}
      </>
    );
  }
  else {
    // 같은 날 다시 오면 인사를 줄이고 선택지를 바로 보인다(기획 03-3 18). 이어 묻기가 남은 오늘 질문이 있으면 그 답으로 돌아가는 길이 주 버튼이다.
    // '또 뭐 볼래?'는 오늘 이 최애에게 물은 적이 있을 때만 한다(다른 최애에게 물은 날 처음 만난 최애가 '또'라고 하지 않게).
    const mine = state.threads.filter((item) => item.character === character);
    const returning = mine.some((item) => item.date === today) && !thanked;
    const unfinished = todays.find((item) => item.status === "answered" && !item.followupAnswer);
    // 다른 날 다시 오면 최애가 지난 질문부터 묻는다. 서버가 최근 30개만 주므로 30개가 찼으면 날 수는 말하지 않는다.
    const earlier = returning || thanked ? undefined : mine.find((item) => item.date < today);
    const asking = Boolean(earlier) && recall === null;
    const greeting = thanked ? lines.shared
      : returning ? lines.again
      : asking ? lines.recall(days)
      : earlier && recall !== "skip" && recall ? lines.recalled[recall]
      : lines.topic;
    spoken = saidAll(greeting, !returning);
    panel = (
      <>
        <section className={`${styles.talk} ${asking ? styles.turn : ""}`} aria-live="polite" onClick={() => setSaid(lineKey(greeting))}>
          {asking && earlier ? quoted(earlier.question, earlier.topic) : null}
          {speak(line(greeting, !returning))}
        </section>
        {asking ? (
          <div className={`${styles.replies} ${styles.reveal}`} data-shown={spoken ? "" : undefined}>
            {ASK_RECALLS.map((kind) => (
              <FanAction key={kind} size="sm" className={styles.reply} onClick={() => setRecall(kind)}>
                {askRecall(kind, character)}
              </FanAction>
            ))}
          </div>
        ) : (
          <div className={`${styles.choices} ${styles.topics} ${styles.reveal}`} data-shown={spoken ? "" : undefined} role="group" aria-label={text("askTopics")}>
            {ASK_TOPICS.map((item) => (
              <FanAction key={item} variant="text" className={styles.cell} leadingIcon={item === "free" && locale === "ko" ? undefined : <FanIcon icon={topicIcon[item]} />} onClick={() => askGo({ step: "write", topic: item })}>
                {text(topicKey[item])}
              </FanAction>
            ))}
          </div>
        )}
      </>
    );
    // 지난 질문이 아직이라고 했고 이어 묻기가 남아 있으면 그 질문을 이어 가는 길이 주 버튼이다.
    if (earlier && recall === "notyet" && !earlier.followupAnswer)
      main = { label: text("askFollow"), tag: text("askFollowOnce"), onClick: () => askGo({ step: "follow", thread: earlier.threadId }) };
    if (unfinished) main = { label: text("askFollow"), tag: text("askFollowOnce"), onClick: () => open(unfinished) };
  }

  // 장면의 분위기: 답을 기다릴 때 어두워졌다가 답이 나오면 밝아지고, 원화 해상도가 남는 화면에서는 얼굴 쪽으로 다가간다.
  const mood = view.startsWith("draft") ? "think" : view.startsWith("answer") ? (ending ? "close" : "speak") : view.startsWith("write") || view.startsWith("follow") ? "listen" : "idle";
  // 위기 신호 답에서는 최애 그림을 가리고 남은 수를 숨긴다(기획 03-6 27).
  const crisis = at.step === "answer" && shown?.klass === "crisis" && !draft;
  // 표정: 답은 웃음, 고른 반응에 답하는 쪽과 그 뒤 이어 묻기는 반응별 표(askReactionExpression), 반응 없는 이어 묻기는 놀람.
  // 답을 기다리는 동안·안전 안내·질문 수 안내는 기본. 답과 상관없는 장면(주제 고르기·입력)에서는 표정 판을 쓰지 않는다.
  const expression = crisis ? null
    : view.startsWith("draft") ? expressionFor.wait
    : view.startsWith("follow") ? (picked ? askReactionExpression[picked] : expressionFor.followup)
    : !view.startsWith("answer") ? null
    : shown?.status !== "answered" || shown.klass ? expressionFor.wait
    : reacting && picked ? askReactionExpression[picked]
    : expressionFor.answer;
  const revealAnswer = !!shown && !draft && !shown.klass && shown.status === "answered" && (
    (view.startsWith("answer") && fresh === shown.threadId) ||
    (view.startsWith("follow") && fresh === `${shown.threadId}:follow`)
  );
  const quote = (shown?.status === "answered" ? shown.answer : state?.threads[0]?.answer)?.split("\n").at(-1);
  return (
    <div className={styles.root} data-chemi-immersive="" data-ask-step={at.step} data-mood={mood} data-crisis={crisis ? "" : undefined} data-beat={picked && shown && fresh === `${shown.threadId}:react` ? picked : undefined}>
      <SceneBackdrop tall={art.tall} wide={art.wide} loop={expression === null ? askLoop(where, who) : null} alt={name}
        expression={<SceneExpression scene={where} character={who} portrait={art.tall} expression={expression} wide="64" />} />
      <div className={styles.top}>
        <FanIconButton aria-label={text("back")} className={styles.round} onClick={askBack}>
          <FanIcon icon={ChevronLeft} />
        </FanIconButton>
        <SceneSound className={styles.round} locale={locale} reveal={revealAnswer} />
        {days > 1 && !crisis ? (
          <span className={`${styles.count} ${styles.days}`} aria-label={`${creatorName(character, locale)} ${text("askDays", { count: days })}`}>
            <FanIcon icon={Heart} size={16} />
            <FanText role="label" aria-hidden="true">{text("askDays", { count: days })}</FanText>
          </span>
        ) : null}
        {state && !crisis ? (
          <span className={styles.count} aria-label={text("askLeftLabel", { count: state.left })}>
            <FanIcon icon={MessageCircle} size={16} />
            <FanText role="label" aria-hidden="true">{text("askLeft")}</FanText>
            <FanText role="label"><RollingNumber value={state.left} /></FanText>
          </span>
        ) : null}
        <FanIconButton aria-label={text("askHistory")} className={`${styles.round} ${styles.history}`} onClick={() => setSheet("history")}>
          <FanIcon icon={History} />
        </FanIconButton>
      </div>
      {/* PC 는 대화판 왼쪽 아래에 물어본 것을 늘 띄운다. 줄을 누르면 가운데가 그 질문으로 바뀐다(기획 03-6 PC 21, DF-ASK-014). */}
      {wide && state && !crisis ? (
        <aside className={styles.asked} aria-label={text("askHistory")}>
          <FanText as="p" role="label">{text("askHistory")}</FanText>
          {state.threads.length ? (
            <ul className={styles.list}>
              {state.threads.map((item) => historyRow(item, "side"))}
            </ul>
          ) : (
            <FanText as="p" role="meta">{text("askHistoryEmpty")}</FanText>
          )}
        </aside>
      ) : null}
      <div className={styles.panel} ref={panelBox}>
        <div className={styles.board} key={view}>
          {panel}
          {main && !paging ? (
            <div className={`${styles.actions} ${styles.reveal}`} data-shown={spoken ? "" : undefined}>
              <FanAction
                variant="primary"
                className={styles.main}
                leadingIcon={main.icon ? <FanIcon icon={main.icon} /> : undefined}
                loading={main.loading}
                onClick={main.onClick}
              >
                {main.label}
                {main.tag ? <FanTag tone="fan" className={styles.onMain}>{main.tag}</FanTag> : null}
              </FanAction>
              {below}
            </div>
          ) : null}
        </div>
      </div>

      <FanSheet
        open={sheet === "history"}
        onOpenChange={(next) => !next && setSheet(null)}
        title={text("askHistory")}
        closeLabel={text("close")}
        primary={state?.threads.length ? undefined : { label: text("askStart"), onClick: () => { setSheet(null); again(); } }}
      >
        {state?.threads.length ? (
          <ul className={styles.list}>
            {state.threads.map((item) => historyRow(item, "sheet"))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <img className={styles.faceLarge} src={art.face} alt="" />
            <FanText as="p" role="body">{text("askHistoryEmpty")}</FanText>
          </div>
        )}
      </FanSheet>

      <ExtraPlayDialog
        open={sheet === "extra"}
        onOpenChange={(next) => !next && setSheet(null)}
        onConfirm={() => {
          setSheet(null);
          setExtra(true);
          askGo({ step: "topic" });
        }}
        busy={false}
        locale={locale}
        points={state?.points}
        cost={extraCost}
        extraRemaining={state?.extraLeft ?? 0}
        labels={{ title: text("askExtraTitle", { cost: extraCost }), extra: text("askExtraLabel"), pay: text("askExtraPay", { cost: extraCost }) }}
      />
      <FanSheet
        open={sheet === "share"}
        onOpenChange={(next) => !next && setSheet(null)}
        title={text("share")}
        closeLabel={text("close")}
        secondary={canSend ? { label: text("copyLink"), onClick: () => void share("copy") } : undefined}
        primary={
          canSend
            ? { label: text("send"), loading: busy === "share", onClick: () => void share("send") }
            : { label: text("copyLink"), loading: busy === "share", onClick: () => void share("copy") }
        }
      >
        <div className={styles.shareTop} data-bonus={bonus.pass || bonus.exp ? "" : undefined}>
          <figure className={styles.card}>
            <img src={art.tall} alt="" />
            <figcaption>
              {quote ? <FanText as="p" role="label">{quote}</FanText> : null}
              <FanText role="meta">{`${name} · ${shortDate(today)}`}</FanText>
            </figcaption>
          </figure>
          {bonus.pass || bonus.exp ? (
            <div className={styles.reward}>
              {bonus.pass ? (
                <>
                  <FanText role="label" className={styles.rewardLabel}>{text("askShareFirst")}</FanText>
                  <FanText as="strong" role="item" className={styles.rewardLabel}>{text("shareQuestionBonus")}</FanText>
                </>
              ) : null}
              {bonus.exp ? (
                <FanText as="strong" role={bonus.pass ? "meta" : "item"} className={bonus.pass ? undefined : styles.rewardLabel}>{text("askMiniGain", { name })}</FanText>
              ) : null}
            </div>
          ) : null}
        </div>
      </FanSheet>
    </div>
  );
}
