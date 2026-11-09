"use client";
import { Button as BaseButton } from "@base-ui/react/button";
import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import { RichBody, type RichAttachmentRenderer } from "@/components/editor/rich-body";
import { editorText } from "@/components/editor/editor-copy";
import { richDocumentAttachments, type RichDocument } from "@/components/editor/rich-document";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { TranslationControl, type AutomaticTranslation } from "@/features/content-safety/ui/use-automatic-translation";
import type { AppLocale } from "@/i18n/locales";
import contentStyles from "@/features/content-safety/ui/content.module.css";
import styles from "./post-detail.module.css";

/** Formatted source text, or its translation as plain text with the post's media kept. The stored document never changes. */
export function TranslatedRichPostBody({ document, translation: { observeElement, ...translation }, locale, renderAttachment }: { document: RichDocument; translation: AutomaticTranslation; locale: AppLocale; renderAttachment: RichAttachmentRenderer }) {
  const attachments = useMemo(() => richDocumentAttachments(document), [document]);
  return <div ref={observeElement}>
    {translation.showing
      ? <><p className={contentStyles.body} lang={locale}>{translation.texts[0]}</p>{attachments.map(item => <div key={item.assetId} className={styles.translatedMedia}>{renderAttachment(item)}</div>)}</>
      : <RichBody document={document} locale={locale} renderAttachment={renderAttachment} />}
    <TranslationControl locale={locale} translation={translation} />
  </div>;
}

/** Inline video of a fan post: the poster first, the file only after a press. */
export function PostInlineVideo({ video, locale, publicFanPost }: { video: { id: string; width: number; height: number }; locale: AppLocale; publicFanPost: boolean }) {
  const [playing, setPlaying] = useState(false), label = editorText(locale, "playVideo");
  return <div className={styles.inlineVideo}>
    <AuthenticatedMedia asset={{ ...video, kind: "video" }} locale={locale} publicFanPost={publicFanPost} alt={label} play={playing} />
    {!playing && <BaseButton aria-label={label} onClick={() => setPlaying(true)}><Play aria-hidden="true" /></BaseButton>}
  </div>;
}
