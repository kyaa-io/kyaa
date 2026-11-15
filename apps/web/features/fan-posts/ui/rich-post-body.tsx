"use client";
import { useMemo, useState } from "react";
import { RichBody, type RichAttachmentRenderer } from "@/components/editor/rich-body";
import { editorText } from "@/components/editor/editor-copy";
import { richDocumentAttachments, type RichDocument } from "@/components/editor/rich-document";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { TranslationControl, useAutomaticTranslation, type AutomaticTranslation } from "@/features/content-safety/ui/use-automatic-translation";
import type { TargetType } from "../domain/content";
import type { AppLocale } from "@/i18n/locales";
import contentStyles from "@/features/content-safety/ui/content.module.css";
import styles from "./post-detail.module.css";

/** Formatted source text, or its translation as plain text with the post's media kept. The stored document never changes. */
export function TranslatedRichPostBody({ document, sourceText, target, locale, renderAttachment }: { document: RichDocument; sourceText: string; target: { targetType: TargetType; targetId: string; sourceRevision: number }; locale: AppLocale; renderAttachment: RichAttachmentRenderer }) {
  const texts = useMemo(() => [sourceText], [sourceText]);
  const { observeElement, ...translation } = useAutomaticTranslation({ texts, locale, target });
  const attachments = useMemo(() => richDocumentAttachments(document), [document]);
  return <div ref={observeElement}>
    {translation.showing
      ? <><p className={contentStyles.body} lang={locale}>{translation.texts[0]}</p>{attachments.map(item => <div key={item.assetId} className={styles.translatedMedia}>{renderAttachment(item)}</div>)}</>
      : <RichBody document={document} locale={locale} renderAttachment={renderAttachment} />}
    <TranslationControl locale={locale} translation={translation} />
  </div>;
}

/** The article of a board post read by a signed-in reader. The translation is shared with the title (`post-card.tsx` owns it): `translated` is the
 *  article slot, "" when the post has none. Without a translation the source shows as written, formatted when the post has a document. */
export function SlotPostBody({ document, plainText, translated, translation, observeElement, locale, renderAttachment }: {
  document: RichDocument | null; plainText: string; translated: string; translation: Omit<AutomaticTranslation, "observeElement" | "texts">;
  observeElement: (node: HTMLElement | null) => void; locale: AppLocale; renderAttachment: RichAttachmentRenderer;
}) {
  const attachments = useMemo(() => document ? richDocumentAttachments(document) : [], [document]);
  const content = translation.showing && translated.trim()
    ? <><p className={contentStyles.body} lang={locale}>{translated}</p>{attachments.map(item => <div key={item.assetId} className={styles.translatedMedia}>{renderAttachment(item)}</div>)}</>
    : document ? <RichBody document={document} locale={locale} renderAttachment={renderAttachment} /> : plainText ? <p className={contentStyles.body}>{plainText}</p> : null;
  if (!content && !translation.eligible && !translation.error) return null;
  return <div ref={observeElement} data-post-body="">{content}<TranslationControl locale={locale} translation={translation} /></div>;
}

/** Inline video of a fan post: the shared feed video loads and autoplays (muted) when visible. */
export function PostInlineVideo({ video, locale, publicFanPost }: { video: { id: string; width: number; height: number }; locale: AppLocale; publicFanPost: boolean }) {
  const label = editorText(locale, "playVideo");
  return <div className={styles.inlineVideo}>
    <AuthenticatedMedia asset={{ ...video, kind: "video" }} locale={locale} publicFanPost={publicFanPost} alt={label} play />
  </div>;
}
