"use client";
import type { JSONContent } from "@tiptap/core";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { createElement, useMemo, type ReactNode } from "react";
import type { AppLocale } from "@/i18n/locales";
import type { RichAttachment, RichAttachmentKind, RichDocument } from "./rich-document";
import { richDocumentExtensions } from "./rich-extensions";
import { RichYouTubeEmbed } from "./rich-youtube";
import { RichIsland, stableTree } from "./stable-tree";
import styles from "./rich-text.module.css";

export type RichAttachmentRenderer = (attachment: RichAttachment) => ReactNode;

/** Draws a sanitized document through React. There is no HTML string on this path. */
export function RichBody({ document, locale, renderAttachment }: { document: RichDocument; locale: AppLocale; renderAttachment: RichAttachmentRenderer }) {
  // `stableTree` turns the renderer's per-call wrappers into plain tags, so a later render (a re-read hands over a new document object and
  // a new renderer) keeps every photo and video node mounted. The memo only saves the work of building the same tree again.
  const tree = useMemo(() => stableTree(renderToReactElement({
    content: document as JSONContent,
    extensions: richDocumentExtensions,
    options: {
      nodeMapping: {
        attachment: ({ node }) => <div className={styles.media}><RichIsland>{renderAttachment({ assetId: String(node.attrs.assetId), kind: node.attrs.kind as RichAttachmentKind })}</RichIsland></div>,
        youtube: ({ node }) => <RichIsland><RichYouTubeEmbed videoId={String(node.attrs.videoId)} locale={locale} /></RichIsland>,
      },
      markMapping: {
        link: ({ mark, children }) => createElement("a", { href: String(mark.attrs.href), target: "_blank", rel: "nofollow ugc noopener noreferrer", "data-outbound-placement": "content", "data-outbound-kind": "external" }, children),
      },
    },
  })), [document, locale, renderAttachment]);
  return <div className={styles.body} data-rich-body="">{tree}</div>;
}
