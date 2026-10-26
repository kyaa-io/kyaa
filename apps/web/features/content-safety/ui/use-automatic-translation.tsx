"use client";
import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { translationSchema, type TargetType } from "@/features/fan-posts/domain/content";
import { shouldOfferTranslation } from "../domain/translation-eligibility";
import styles from "./content.module.css";

type Target = { targetType: TargetType; targetId: string; sourceRevision: number };
type AutomaticTranslation = { observeElement: (node: HTMLElement | null) => void; eligible: boolean; showing: boolean; texts: readonly string[]; busy: boolean; error: string; toggle: () => void };
type Result = { key: string; texts?: readonly string[]; error?: string; busy?: boolean };
const requests = new Map<string, Promise<readonly string[]>>();

function requestTranslation(input: { authenticated: boolean; getAccessToken: () => Promise<string | null>; key: string; locale: AppLocale; texts: readonly string[]; target?: Target }) {
  let pending = requests.get(input.key);
  if (!pending) {
    pending = (async () => {
      const token = input.authenticated ? await input.getAccessToken() : null;
      if (input.authenticated && !token) throw new Error("AUTHENTICATION_REQUIRED");
      const objectTarget = input.target && input.authenticated;
      const response = await fetch(objectTarget ? "/api/content-translations" : "/api/display-translations", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000),
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(objectTarget ? { targetType: input.target!.targetType, targetId: input.target!.targetId, targetLocale: input.locale, locale: toContentLocale(input.locale) }
          : input.texts.length === 1 ? { text: input.texts[0], targetLocale: input.locale } : { texts: input.texts, targetLocale: input.locale }),
      });
      const raw: unknown = await response.json();
      if (!response.ok) throw new Error(raw && typeof raw === "object" && "error" in raw && raw.error && typeof raw.error === "object" && "code" in raw.error && typeof raw.error.code === "string" ? raw.error.code : "TRANSLATION_FAILED");
      if (objectTarget) {
        const parsed = translationSchema.parse(raw);
        if (parsed.targetId !== input.target!.targetId || parsed.targetType !== input.target!.targetType || parsed.targetLocale !== input.locale || parsed.sourceRevision !== input.target!.sourceRevision) throw new Error("TRANSLATION_FAILED");
        return [parsed.translatedText];
      }
      if (!raw || typeof raw !== "object") throw new Error("TRANSLATION_FAILED");
      const values = "translatedTexts" in raw ? raw.translatedTexts : "translatedText" in raw ? [raw.translatedText] : null;
      if (!Array.isArray(values) || values.length !== input.texts.length || values.some(text => typeof text !== "string" || !text.trim() || text.length > 100_000)) throw new Error("TRANSLATION_FAILED");
      return values as string[];
    })();
    requests.set(input.key, pending);
    pending.catch(() => { if (requests.get(input.key) === pending) requests.delete(input.key); });
    if (requests.size > 200) requests.delete(requests.keys().next().value!);
  }
  return pending;
}

export function useAutomaticTranslation({ texts, locale, target, enabled = true }: {
  texts: readonly string[]; locale: AppLocale; target?: Target; enabled?: boolean;
}): AutomaticTranslation {
  const auth = useByUsAuth(), session = useByUsSession(), copy = contentCopy(locale);
  const identity = `${auth.authenticated}:${session.ownerId ?? auth.user?.id ?? "guest"}:${session.generation}`;
  const key = JSON.stringify([identity, locale, target ?? null, texts]);
  const eligible = useMemo(() => texts.some(text => shouldOfferTranslation(text, locale)), [texts, locale]);
  const ready = auth.ready && (!auth.authenticated || session.ready);
  const [element, observeElement] = useState<HTMLElement | null>(null);
  const [visibleFor, setVisibleFor] = useState<string | null>(null);
  const [state, setState] = useState<Result>({ key });
  const [original, setOriginal] = useState<string | null>(null);
  const load = useEffectEvent(() => requestTranslation({ authenticated: auth.authenticated, getAccessToken: auth.getAccessToken, key, locale, texts, target }));
  useEffect(() => {
    const node = element;
    if (!node || !enabled || !ready || !eligible) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisibleFor(key); observer.disconnect(); }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [element, key, ready, eligible, enabled]);

  useEffect(() => {
    if (!enabled || !ready || !eligible || visibleFor !== key) return;
    let active = true;
    setState({ key, busy: true });
    void load().then(result => { if (active) setState({ key, texts: result }); }, error => {
      if (active) setState({ key, error: error instanceof Error && error.message === "TRANSLATION_RATE_LIMITED" ? copy.translationLimit : copy.translationFailed });
    });
    return () => { active = false; };
  }, [key, ready, eligible, visibleFor, enabled, copy.translationLimit, copy.translationFailed]);
  const retry = async () => {
    setState({ key, busy: true });
    try { const result = await requestTranslation({ authenticated: auth.authenticated, getAccessToken: auth.getAccessToken, key, locale, texts, target }); setState(previous => previous.key === key ? { key, texts: result } : previous); }
    catch (error) { setState(previous => previous.key === key ? { key, error: error instanceof Error && error.message === "TRANSLATION_RATE_LIMITED" ? copy.translationLimit : copy.translationFailed } : previous); }
  };
  const result = state.key === key ? state : null;
  const showing = enabled && ready && eligible && original !== key && !!result?.texts;
  return { observeElement, eligible: enabled && ready && eligible, showing, texts: showing ? result!.texts! : texts,
    busy: !!result?.busy, error: result?.error ?? "", toggle: () => {
      if (result?.texts) setOriginal(showing ? key : null);
      else void retry();
    } };
}

export function TranslationControl({ locale, translation }: { locale: AppLocale; translation: Omit<AutomaticTranslation, "observeElement" | "texts"> }) {
  const copy = contentCopy(locale);
  return <>{translation.eligible && <button type="button" className={styles.translationButton} disabled={translation.busy} onClick={translation.toggle} aria-pressed={translation.showing}>
    {translation.busy ? copy.translating : translation.showing ? copy.original : copy.translate}
  </button>}{translation.error && <span role="alert" className={styles.error}>{translation.error}</span>}</>;
}

export function TranslatedText({ text, locale, children, className, controls = true, as: Tag = "span" }: {
  text: string; locale: AppLocale; children?: ReactNode; className?: string; controls?: boolean; as?: "span" | "p" | "div";
}) {
  const texts = useMemo(() => [text], [text]);
  const { observeElement, ...translation } = useAutomaticTranslation({ texts, locale });
  return <Tag ref={observeElement} className={className} lang={translation.showing ? locale : undefined} title={!controls && translation.showing ? text : undefined}>
    {translation.showing ? translation.texts[0] : children ?? text}
    {controls && <TranslationControl locale={locale} translation={translation} />}
  </Tag>;
}
