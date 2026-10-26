"use client";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__notice__notice-body";
import { translate } from "@/i18n/messages";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type { JSONContent } from "@tiptap/core";
import React, { useMemo } from "react";
import { TranslationControl, useAutomaticTranslation } from "@/features/content-safety/ui/use-automatic-translation";
import { shouldOfferTranslation } from "@/features/content-safety/domain/translation-eligibility";
import type { TiptapDocument } from "../../server/notice/notice-domain";
import { noticeExtensions } from "./tiptap-extensions";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { isPrivateNoticeImage } from "@/server/notice/notice-domain";
import styles from "./notice-detail.module.css";

export function NoticeBody(props: { document: TiptapDocument; locale: AppLocale; adminPreview?: boolean }) {
  return props.adminPreview ? <RenderedNoticeBody {...props} /> : <TranslatedNoticeBody {...props} />;
}

function TranslatedNoticeBody({ document, locale }: { document: TiptapDocument; locale: AppLocale }) {
  const texts = useMemo(() => {
    const result: string[] = [];
    const collect = (node: JSONContent) => {
      if (node.type === "text" && node.text && !node.marks?.some(mark => mark.type === "code") && shouldOfferTranslation(node.text, locale) && !result.includes(node.text)) result.push(node.text);
      node.content?.forEach(collect);
    };
    collect(document as JSONContent);
    return result;
  }, [document, locale]);
  const { observeElement, ...translation } = useAutomaticTranslation({ texts, locale });
  const translatedDocument = useMemo(() => {
    if (!translation.showing) return document;
    const replacements = new Map(texts.map((text, index) => [text, translation.texts[index]]));
    const replace = (node: JSONContent): JSONContent => ({ ...node,
      ...(node.type === "text" && node.text && !node.marks?.some(mark => mark.type === "code") && replacements.has(node.text) ? { text: replacements.get(node.text) } : {}),
      ...(node.content ? { content: node.content.map(replace) } : {}),
    });
    return replace(document as JSONContent) as TiptapDocument;
  }, [document, texts, translation.showing, translation.texts]);
  return <div ref={observeElement} lang={translation.showing ? locale : undefined}>
    <RenderedNoticeBody document={translatedDocument} locale={locale} />
    <TranslationControl locale={locale} translation={translation} />
  </div>;
}

function RenderedNoticeBody({ document, locale, adminPreview = false }: { document: TiptapDocument; locale: AppLocale; adminPreview?: boolean }) {
  const newWindowLabel = locale === "ko" ? "새 창" : translate(locale, localizedMessages.m78f7fe6d9b7c, "opens in a new window");
  return (
    <div className={styles.body}>
      {renderToReactElement({
        content: document as JSONContent,
        extensions: noticeExtensions,
        options: {
          nodeMapping: {
            image: ({ node }) => isPrivateNoticeImage(node.attrs.src)
              ? <ContentAssetImage asset={{ id: node.attrs.src.slice("/api/content-assets/".length), width: node.attrs.width || 960, height: node.attrs.height || 640 }} locale={locale} alt={node.attrs.alt || ""} adminPreview={adminPreview} />
              : node.attrs.src.startsWith("/api/public/notice-media/") ? <ContentAssetImage noticeMedia adminPreview={adminPreview} asset={{ id: node.attrs.src.slice("/api/public/notice-media/".length), width: node.attrs.width || 960, height: node.attrs.height || 640 }} locale={locale} alt={node.attrs.alt || ""} />
              : <img src={node.attrs.src} alt={node.attrs.alt || ""} />,
          },
          markMapping: {
            link: ({ mark, children }) => React.createElement(
              "a",
              { href: mark.attrs.href, target: "_blank", rel: "noreferrer" },
              children,
              React.createElement("span", { className: styles.srOnly }, `, ${newWindowLabel}`),
            ),
          },
        },
      })}
    </div>
  );
}
