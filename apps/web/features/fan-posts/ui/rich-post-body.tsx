"use client";
import type { ReactNode } from "react";
import { RichBody, type RichAttachmentRenderer } from "@/components/editor/rich-body";
import { editorText } from "@/components/editor/editor-copy";
import type { RichDocument } from "@/components/editor/rich-document";
import { LinkifiedText } from "@/features/content-safety/ui/linkified-text";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import type { AutomaticTranslation } from "@/features/content-safety/ui/use-automatic-translation";
import type { AppLocale } from "@/i18n/locales";
import contentStyles from "@/features/content-safety/ui/content.module.css";
import styles from "./post-detail.module.css";

/** Formatted source text, or its translation as plain text with the post's media kept. The stored document never changes. */
export function TranslatedRichPostBody({ document, translation, observeElement, locale, renderAttachment }: { document: RichDocument; translation: Pick<AutomaticTranslation, "showing" | "texts">; observeElement: (node: HTMLElement | null) => void; locale: AppLocale; renderAttachment: RichAttachmentRenderer }) {
  // The document is always drawn by the same element, so a switch never remounts its photos and videos (the translation sits above it, the document's text is hidden).
  return <div ref={observeElement}>
    {translation.showing ? <p className={contentStyles.body} lang={locale}>{translation.texts[0]}</p> : null}
    <RichBody document={document} locale={locale} renderAttachment={renderAttachment} textHidden={translation.showing} />
  </div>;
}

/** Plain-text board article (no document): the translation replaces the text; there is no media inside the text. */
export function TranslatedPlainPostBody({ children, translation, observeElement, locale }: { children: ReactNode; translation: Pick<AutomaticTranslation, "showing" | "texts">; observeElement: (node: HTMLElement | null) => void; locale: AppLocale }) {
  return <div ref={observeElement} className={contentStyles.translation}>
    {translation.showing ? <p className={contentStyles.body} lang={locale}><LinkifiedText text={translation.texts[0]} locale={locale} /></p> : children}
  </div>;
}

/** The article of a board post read by a signed-in reader. The translation is shared with the title (`post-card.tsx` owns it): `translated` is the
 *  article slot, "" when the post has none. Without a translation the source shows as written, formatted when the post has a document. */
export function SlotPostBody({ document, plainText, translated, translation, observeElement, locale, renderAttachment }: {
  document: RichDocument | null; plainText: string; translated: string; translation: Omit<AutomaticTranslation, "observeElement" | "texts">;
  observeElement: (node: HTMLElement | null) => void; locale: AppLocale; renderAttachment: RichAttachmentRenderer;
}) {
  const translatedShown = translation.showing && translated.trim() !== "";
  // With a document the same RichBody element stays mounted in both states (see TranslatedRichPostBody); the translation is drawn above it.
  const content = document
    ? <>{translatedShown ? <p className={contentStyles.body} lang={locale}>{translated}</p> : null}<RichBody document={document} locale={locale} renderAttachment={renderAttachment} textHidden={translatedShown} /></>
    : translatedShown ? <p className={contentStyles.body} lang={locale}>{translated}</p> : plainText ? <p className={contentStyles.body}>{plainText}</p> : null;
  if (!content && !translation.eligible && !translation.error) return null;
  return <div ref={observeElement} data-post-body="">{content}</div>;
}

/** Inline video of a fan post: the shared feed video loads and autoplays (muted) when visible. */
export function PostInlineVideo({ video, locale, publicFanPost }: { video: { id: string; width: number; height: number }; locale: AppLocale; publicFanPost: boolean }) {
  const label = editorText(locale, "playVideo");
  return <div className={styles.inlineVideo}>
    <AuthenticatedMedia asset={{ ...video, kind: "video" }} locale={locale} publicFanPost={publicFanPost} alt={label} play />
  </div>;
}
