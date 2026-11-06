"use client";
import type { JSONContent } from "@tiptap/core";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { createElement, type ReactNode } from "react";
import type { AppLocale } from "@/i18n/locales";
import type { RichAttachment, RichAttachmentKind, RichDocument } from "./rich-document";
import { richDocumentExtensions } from "./rich-extensions";
import { RichYouTubeEmbed } from "./rich-youtube";
import styles from "./rich-text.module.css";

export type RichAttachmentRenderer = (attachment: RichAttachment) => ReactNode;

/** Draws a sanitized document through React. There is no HTML string on this path. */
export function RichBody({ document, locale, renderAttachment }: { document: RichDocument; locale: AppLocale; renderAttachment: RichAttachmentRenderer }) {
  return <div className={styles.body} data-rich-body="">
    {renderToReactElement({
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
    })}
  </div>;
}
