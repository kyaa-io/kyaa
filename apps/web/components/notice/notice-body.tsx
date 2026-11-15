"use client";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__notice__notice-body";
import { translate } from "@/i18n/messages";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type { JSONContent } from "@tiptap/core";
import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { TranslationControl, useAutomaticTranslation } from "@/features/content-safety/ui/use-automatic-translation";
import { shouldOfferTranslation } from "@/features/content-safety/domain/translation-eligibility";
import type { TiptapDocument } from "../../server/notice/notice-domain";
import { noticeExtensions } from "./tiptap-extensions";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { isPrivateNoticeImage } from "@/server/notice/notice-domain";
import { BodyLink } from "@/features/content-safety/ui/linkified-text";
import { linkifyDocument } from "@/features/content-safety/domain/linkify";
import styles from "./notice-detail.module.css";

type SharedNoticeTranslation = { title: string; document: TiptapDocument; translation: Omit<ReturnType<typeof useAutomaticTranslation>, "observeElement">; observeElement: ReturnType<typeof useAutomaticTranslation>["observeElement"] };
const SharedTranslation = createContext<SharedNoticeTranslation | null>(null);

export function NoticeBody(props: { document: TiptapDocument; locale: AppLocale; adminPreview?: boolean; operatorChannelId?: string }) {
  const shared = useContext(SharedTranslation);
  if (shared && !props.adminPreview) return <div ref={shared.observeElement} lang={shared.translation.showing ? props.locale : undefined}><RenderedNoticeBody {...props} document={shared.document} /></div>;
  return props.adminPreview ? <RenderedNoticeBody {...props} /> : <TranslatedNoticeBody {...props} />;
}

/** Title and body follow one translation state: one request, one 번역/원문 toggle. The source document and title are never mutated. */
export function NoticeTranslation({ title, document, locale, children }: { title: string; document: TiptapDocument; locale: AppLocale; children: ReactNode }) {
  const texts = useMemo(() => collectNoticeTexts(document, locale, title), [document, locale, title]);
  const { observeElement, ...translation } = useAutomaticTranslation({ texts, locale });
  const translatedDocument = useMemo(() => applyNoticeTranslation(document, texts, translation.showing ? translation.texts : null), [document, texts, translation.showing, translation.texts]);
  const shownTitle = translation.showing ? translation.texts[texts.indexOf(title)] ?? title : title;
  return <SharedTranslation.Provider value={{ title: shownTitle, document: translatedDocument, translation, observeElement }}>{children}</SharedTranslation.Provider>;
}

export function NoticeTitle({ locale }: { locale: AppLocale }) {
  const shared = useContext(SharedTranslation);
  return shared ? <h1 lang={shared.translation.showing ? locale : undefined}>{shared.title}</h1> : null;
}

export function NoticeTranslationControl({ locale }: { locale: AppLocale }) {
  const shared = useContext(SharedTranslation);
  return shared ? <TranslationControl locale={locale} translation={shared.translation} /> : null;
}

function collectNoticeTexts(document: TiptapDocument, locale: AppLocale, title?: string) {
  const result: string[] = [];
  if (title && shouldOfferTranslation(title, locale)) result.push(title);
  const collect = (node: JSONContent) => {
    if (node.type === "text" && node.text && !node.marks?.some(mark => mark.type === "code") && shouldOfferTranslation(node.text, locale) && !result.includes(node.text)) result.push(node.text);
    node.content?.forEach(collect);
  };
  collect(document as JSONContent);
  return result;
}

function applyNoticeTranslation(document: TiptapDocument, texts: readonly string[], translated: readonly string[] | null): TiptapDocument {
  if (!translated) return document;
  const replacements = new Map(texts.map((text, index) => [text, translated[index]]));
  const replace = (node: JSONContent): JSONContent => ({ ...node,
    ...(node.type === "text" && node.text && !node.marks?.some(mark => mark.type === "code") && replacements.has(node.text) ? { text: replacements.get(node.text) } : {}),
    ...(node.content ? { content: node.content.map(replace) } : {}),
  });
  return replace(document as JSONContent) as TiptapDocument;
}

function TranslatedNoticeBody({ document, locale }: { document: TiptapDocument; locale: AppLocale }) {
  const texts = useMemo(() => collectNoticeTexts(document, locale), [document, locale]);
  const { observeElement, ...translation } = useAutomaticTranslation({ texts, locale });
  const translatedDocument = useMemo(() => applyNoticeTranslation(document, texts, translation.showing ? translation.texts : null), [document, texts, translation.showing, translation.texts]);
  return <div ref={observeElement} lang={translation.showing ? locale : undefined}>
    <RenderedNoticeBody document={translatedDocument} locale={locale} />
    <TranslationControl locale={locale} translation={translation} />
  </div>;
}

function RenderedNoticeBody({ document, locale, adminPreview = false, operatorChannelId }: { document: TiptapDocument; locale: AppLocale; adminPreview?: boolean; operatorChannelId?: string }) {
  const newWindowLabel = locale === "ko" ? "새 창" : translate(locale, localizedMessages.m78f7fe6d9b7c, "opens in a new window");
  return (
    <div className={styles.body}>
      {renderToReactElement({
        content: linkifyDocument(document as JSONContent),
        extensions: noticeExtensions,
        options: {
          nodeMapping: {
            image: ({ node }) => isPrivateNoticeImage(node.attrs.src)
              ? <ContentAssetImage asset={{ id: node.attrs.src.slice("/api/content-assets/".length), width: node.attrs.width || 960, height: node.attrs.height || 640 }} locale={locale} alt={node.attrs.alt || ""} adminPreview={adminPreview} operatorChannelId={operatorChannelId} />
              : node.attrs.src.startsWith("/api/public/notice-media/") ? <ContentAssetImage noticeMedia adminPreview={adminPreview} asset={{ id: node.attrs.src.slice("/api/public/notice-media/".length), width: node.attrs.width || 960, height: node.attrs.height || 640 }} locale={locale} alt={node.attrs.alt || ""} />
              : <img src={node.attrs.src} alt={node.attrs.alt || ""} width={node.attrs.width || undefined} height={node.attrs.height || undefined} loading="lazy" />,
          },
          markMapping: {
            link: ({ mark, children }) => <BodyLink official href={mark.attrs.href} newWindowLabel={newWindowLabel}>{children}</BodyLink>,
          },
        },
      })}
    </div>
  );
}
