"use client";
import type { JSONContent } from "@tiptap/core";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { createElement, useMemo, type ReactNode } from "react";
import type { AppLocale } from "@/i18n/locales";
import type { RichAttachment, RichAttachmentKind, RichDocument } from "./rich-document";
import { richDocumentExtensions } from "./rich-extensions";
import { RichYouTubeEmbed } from "./rich-youtube";
import styles from "./rich-text.module.css";

export type RichAttachmentRenderer = (attachment: RichAttachment) => ReactNode;

/** Draws a sanitized document through React. There is no HTML string on this path. */
/** `textHidden`: only the media blocks stay visible. A translated post shows its translation above them, so the media keep one mounted node
 *  (no reload or flash) while the reader switches between the translation and the original. */
export function RichBody({ document, locale, renderAttachment, textHidden = false }: { document: RichDocument; locale: AppLocale; renderAttachment: RichAttachmentRenderer; textHidden?: boolean }) {
  // The renderer builds new component types on every call, so an unmemoized tree remounts every photo and video whenever the parent re-renders
  // (a translation switch, a reaction): they reloaded and flashed. One tree per document, locale and renderer keeps the same nodes.
  const tree = useMemo(() => renderToReactElement({
    content: document as JSONContent,
    extensions: richDocumentExtensions,
    options: {
      nodeMapping: {
        attachment: ({ node }) => <div className={styles.media}>{renderAttachment({ assetId: String(node.attrs.assetId), kind: node.attrs.kind as RichAttachmentKind })}</div>,
        youtube: ({ node }) => <RichYouTubeEmbed videoId={String(node.attrs.videoId)} locale={locale} />,
      },
      markMapping: {
        link: ({ mark, children }) => createElement("a", { href: String(mark.attrs.href), target: "_blank", rel: "nofollow ugc noopener noreferrer", "data-outbound-placement": "content", "data-outbound-kind": "external" }, children),
      },
    },
  }), [document, locale, renderAttachment]);
  return <div className={styles.body} data-rich-body="" data-text-hidden={textHidden || undefined}>{tree}</div>;
}
