"use client";

/**
 * 케미 질문하기(사주·운세·별자리·타로 결과에서 진입). 주제 고르기 → 질문 쓰기 → 최애 답 → 이어 묻기 1번.
 * 남은 질문 수·차감·한도는 서버(/api/chemi/ask)가 정하고, 이 화면은 받은 값만 그린다.
 * 유료 구매 자리는 결제 수단이 붙기 전이라 두지 않는다.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
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
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Coins,
  Heart,
  History,
  Mail,
  MessageCircle,
  RotateCcw,
  Share2,
  Sparkles,
  UsersRound,
} from "@/components/fan-ui/fan-icons";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { RollingNumber } from "@/components/fan-ui/rolling-number";
import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { showShareReward } from "@/features/chemi/i18n/share-reward";
import type { AppLocale } from "@/i18n/locales";
import { askArt, askExamples, askLines, askName, askVoice, ASK_TOPICS, type AskCharacter, type AskContent, type AskTopic } from "./lines";
import { askBack, askGo, type AskLocation } from "./location";
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
};
type AskState = {
  left: number;
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

const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now());
const shortDate = (day: string) => `${day.slice(5, 7)}. ${day.slice(8, 10)}.`;

export function AskScene({ locale, content, character, readingId, at }: {
  locale: AppLocale;
  content: AskContent;
  character: AskCharacter;
  readingId: string;
  at: AskLocation;
}) {
  const text = useReadingCopy();
  const { ready, getAccessToken } = useByUsAuth();
  const [state, setState] = useState<AskState | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [blocked, setBlocked] = useState<Thread | null>(null);
  const [input, setInput] = useState("");
  const [sheet, setSheet] = useState<"history" | "share" | null>(null);
  const [busy, setBusy] = useState<"remind" | "share" | null>(null);
  const [thanked, setThanked] = useState(false);
  const field = useRef<HTMLInputElement>(null);
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

  const name = askName[character];
  const lines = askLines[askVoice[character]];
  const art = askArt(content, character);
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

  // 주제를 바꾸면 쓰던 글을 비우고 입력칸으로 간다.
  const topic = at.step === "write" ? at.topic : null;
  useEffect(() => {
    setInput("");
  }, [topic, at.step]);

  async function send(next: Draft) {
    setDraft({ ...next, failed: false });
    setBlocked(null);
    try {
      const response = await fetch(next.followOf ? "/api/chemi/ask/followup" : "/api/chemi/ask", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(
          next.followOf
            ? { threadId: next.followOf, question: next.question }
            : { threadId: next.threadId, readingId, character, content, topic: next.topic, question: next.question },
        ),
      });
      const body = (await response.json()) as { thread?: Thread; state?: AskState; blocked?: { klass: string; answer: string }; error?: { code: string } };
      if (response.status === 409 && body.error?.code === "CHEMI_LIMIT") {
        setDraft(null);
        setAttempt((value) => value + 1);
        return askGo({ step: "topic" }, "replace");
      }
      if (!response.ok) throw Error(body.error?.code ?? "send");
      if (body.state) setState(body.state);
      setDraft(null);
      if (body.blocked) {
        // 이어 묻기가 난감한 질문이면 답만 보여 주고 이어 묻기 1번은 그대로 남는다.
        setBlocked({
          threadId: next.threadId, character, content, readingId, topic: null, question: next.question, status: "blocked",
          klass: body.blocked.klass, answer: body.blocked.answer, followupQuestion: null, followupAnswer: null, date: kstToday(),
        });
        return askGo({ step: "answer", thread: next.threadId }, "replace");
      }
      if (body.thread?.status === "blocked") setBlocked(body.thread);
      askGo({ step: "answer", thread: next.followOf ?? next.threadId }, next.followOf ? "replace" : "push");
    } catch {
      setDraft({ ...next, failed: true });
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
    askGo({ step: "answer", thread: thread.threadId });
  };
  const again = () => {
    setDraft(null);
    setBlocked(null);
    askGo({ step: "topic" });
  };

  const shown =
    at.step === "answer" || at.step === "follow"
      ? (blocked?.threadId === at.thread ? blocked : state?.threads.find((item) => item.threadId === at.thread)) ?? null
      : null;
  // 답을 찾지 못하는 번호(지워졌거나 남의 것)로 열렸으면 주제 고르기로 돌린다.
  const lost = Boolean(state) && !draft && (at.step === "answer" || at.step === "follow") && !shown;
  useEffect(() => {
    if (lost) askGo({ step: "topic" }, "replace");
  }, [lost]);

  const empty = state?.left === 0;
  const today = kstToday();
  const todays = state?.threads.filter((item) => item.date === today) ?? [];
  const bonus = state?.shareBonus ?? { pass: false, exp: false };
  const canSend = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareAction = (
    <FanAction className={styles.glass} leadingIcon={<FanIcon icon={Share2} />} onClick={() => setSheet("share")}>
      {text("share")}
      {bonus.pass ? <FanTag tone="fan">+1</FanTag> : null}
    </FanAction>
  );
  const speak = (body: React.ReactNode, meta?: string) => (
    <div className={styles.speak}>
      <img className={styles.face} src={art.face} alt="" />
      <div className={styles.speakBody}>
        <p className={styles.who}>
          <FanText role="item">{name}</FanText>
          {meta ? <FanText role="meta">{meta}</FanText> : null}
        </p>
        {body}
      </div>
    </div>
  );
  const mine = (question: string, tag: AskTopic | null) => (
    <div className={styles.mineRow}>
      {tag ? <FanTag tone="fan">{text(topicKey[tag])}</FanTag> : null}
      <FanText as="p" role="body" className={styles.mine}>{question}</FanText>
    </div>
  );
  const paragraphs = (answer: string) => answer.split("\n").map((line) => <FanText as="p" role="body" key={line}>{line}</FanText>);
  const composer = (
    <form className={styles.composer} onSubmit={submit}>
      <input
        ref={field}
        className={styles.field}
        value={input}
        maxLength={100}
        enterKeyHint="send"
        aria-label={text("askInput")}
        placeholder={text("askInput")}
        onChange={(event) => setInput(event.target.value)}
      />
      <FanIconButton type="submit" className={styles.send} aria-label={text("send")} disabled={!input.trim()}>
        <FanIcon icon={ArrowUp} />
      </FanIconButton>
    </form>
  );

  let panel: React.ReactNode;
  // 화면의 주 버튼은 하나: 상태마다 내용만 바꿔 한 자리에 그린다.
  let main: { label: string; onClick: () => void; icon?: typeof Mail; tag?: string; loading?: boolean } | null = null;
  let below: React.ReactNode = null;
  if (failed)
    panel = (
      <section className={styles.board}>
        <FanState kind="error" title={text("askLoadFailed")} actions={<FanAction size="sm" onClick={() => setAttempt((value) => value + 1)}>{text("retry")}</FanAction>} />
      </section>
    );
  else if (!state)
    panel = (
      <section className={styles.board} aria-busy="true">
        {speak(<FanSkeleton width="70%" />)}
      </section>
    );
  else if (draft) {
    panel = (
      <>
        <section className={`${styles.board} ${styles.thread}`} aria-live="polite" aria-busy={!draft.failed}>
          {mine(draft.question, draft.topic)}
          {speak(
            draft.failed ? (
              <p className={styles.sys} role="alert">
                <FanIcon icon={CircleAlert} />
                <FanText role="body">{text("askError")}</FanText>
              </p>
            ) : (
              <span className={styles.waiting} role="status" aria-label={text("askWriting", { name })}>
                <FanSkeleton width="100%" />
                <FanSkeleton width="60%" />
              </span>
            ),
          )}
        </section>
      </>
    );
    if (draft.failed) main = { label: text("askResend"), icon: RotateCcw, onClick: () => void send(draft) };
  }
  else if (state.pausedUntil)
    panel = (
      <section className={styles.board}>
        <p className={styles.sys} role="status">
          <FanIcon icon={CircleAlert} />
          <FanText role="body">
            {text("askPaused", { time: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(state.pausedUntil)) })}
          </FanText>
        </p>
      </section>
    );
  else if (shown && at.step === "answer") {
    panel = (
      <>
        <section className={`${styles.board} ${styles.thread}`} aria-live="polite">
          {mine(shown.question, shown.status === "blocked" ? null : shown.topic)}
          {speak(paragraphs(shown.answer), shown.status === "blocked" ? text("askKept") : undefined)}
          {shown.klass === "crisis" ? (
            <p className={styles.sys}>
              <FanIcon icon={CircleAlert} />
              <FanText role="item">{text("askCrisis")}</FanText>
            </p>
          ) : null}
          {shown.followupQuestion && shown.followupAnswer ? (
            <>
              {mine(shown.followupQuestion, null)}
              {speak(paragraphs(shown.followupAnswer))}
            </>
          ) : null}
        </section>
      </>
    );
    if (shown.status === "blocked") main = { label: text("askOtherAfterGuard"), onClick: again };
    else if (shown.followupAnswer) {
      main = { label: text("askOther"), onClick: again };
      below = <div className={styles.row} data-single="">{shareAction}</div>;
    } else {
      const threadId = shown.threadId;
      main = { label: text("askFollow"), tag: text("askFollowOnce"), onClick: () => askGo({ step: "follow", thread: threadId }) };
      below = (
        <div className={styles.row}>
          <FanAction className={styles.glass} onClick={again}>{text("askOther")}</FanAction>
          {shareAction}
        </div>
      );
    }
  }
  else if (shown && at.step === "follow")
    panel = (
      <>
        <section className={styles.board} aria-live="polite">{speak(<FanText as="p" role="body">{lines.follow}</FanText>, shown.topic ? text(topicKey[shown.topic]) : undefined)}</section>
        {composer}
      </>
    );
  else if (empty) {
    panel = (
      <>
        <section className={`${styles.board} ${styles.thread}`} aria-live="polite">
          <p className={styles.sys} role="status">
            <FanIcon icon={CircleAlert} />
            <FanText role="item">{text("askLimit")}</FanText>
          </p>
          {speak(<FanText as="p" role="body">{state.reminded ? lines.reminded : lines.rest}</FanText>)}
          {todays.length ? (
            <div className={styles.todays}>
              <FanText as="p" role="label">{text("askToday")}</FanText>
              <ul className={styles.list}>
                {todays.map((item) => (
                  <li key={item.threadId} data-row="">
                    <FanAction variant="text" className={styles.rowLink} onClick={() => open(item)}>
                      <span className={styles.rowGrid}>
                        <img className={styles.faceSmall} src={askArt(item.content, item.character).face} alt={askName[item.character]} />
                        <FanText role="body" className={styles.clip}>{item.question}</FanText>
                        <FanIcon icon={ChevronRight} size={16} />
                      </span>
                    </FanAction>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </>
    );
    main = state.reminded
      ? { label: text("share"), icon: Share2, tag: bonus.pass ? text("shareQuestionBonus") : undefined, onClick: () => setSheet("share") }
      : { label: text("askRemind"), icon: Mail, loading: busy === "remind", onClick: () => void remind() };
    below = (
      <div className={styles.row} data-single="">
        {state.reminded ? (
          <span className={styles.status}>
            <FanIcon icon={Check} size={16} />
            <FanText role="label">{text("askReminded")}</FanText>
          </span>
        ) : (
          shareAction
        )}
      </div>
    );
  }
  else if (at.step === "write")
    panel = (
      <>
        <section className={styles.board} aria-live="polite">{speak(<FanText as="p" role="body">{lines.reask[at.topic]}</FanText>, text(topicKey[at.topic]))}</section>
        <div className={styles.examples} role="group" aria-label={text("askExamples")}>
          {askExamples(at.topic, character).map((example) => (
            <FanAction
              key={example}
              size="sm"
              className={`${styles.glass} ${styles.example}`}
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
        {composer}
      </>
    );
  else
    panel = (
      <>
        <div className={styles.topics} role="group" aria-label={text("askTopics")}>
          {ASK_TOPICS.map((item) => (
            <FanAction key={item} size="sm" className={styles.glass} leadingIcon={<FanIcon icon={topicIcon[item]} />} onClick={() => askGo({ step: "write", topic: item })}>
              {text(topicKey[item])}
            </FanAction>
          ))}
        </div>
        <section className={styles.board} aria-live="polite">{speak(<FanText as="p" role="body">{thanked ? lines.shared : lines.topic}</FanText>)}</section>
      </>
    );

  const quote = (shown?.status === "answered" ? shown.answer : state?.threads[0]?.answer)?.split("\n").at(-1);
  return (
    <div className={styles.root} data-chemi-immersive="" data-ask-step={at.step}>
      <div className={styles.top}>
        <FanIconButton aria-label={text("back")} className={styles.round} onClick={askBack}>
          <FanIcon icon={ChevronLeft} />
        </FanIconButton>
        {state ? (
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
      <div className={styles.stage}>
        <picture className={styles.art}>
          <source media="(min-width: 64rem)" srcSet={art.wide} />
          <img src={art.tall} alt={name} />
        </picture>
        <div className={styles.panel} ref={panelBox}>
          {panel}
          {main ? (
            <div className={styles.actions}>
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
            {state.threads.map((item) => (
              <li key={item.threadId} data-row="">
                <FanAction variant="text" className={styles.rowLink} onClick={() => open(item)}>
                  <span className={`${styles.rowGrid} ${styles.histRow}`}>
                    <img className={styles.face} src={askArt(item.content, item.character).face} alt={askName[item.character]} />
                    <span className={styles.histText}>
                      <FanText role="item" className={styles.clip}>{item.question}</FanText>
                      <FanText role="meta">
                        {shortDate(item.date)}
                        {item.topic ? ` · ${text(topicKey[item.topic])}` : ""}
                        {item.followupAnswer ? "" : ` · ${text("askFollow")} ${text("askFollowOnce")}`}
                      </FanText>
                    </span>
                    <FanIcon icon={ChevronRight} size={16} />
                  </span>
                </FanAction>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <img className={styles.faceLarge} src={art.face} alt="" />
            <FanText as="p" role="body">{text("askHistoryEmpty")}</FanText>
          </div>
        )}
      </FanSheet>

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
