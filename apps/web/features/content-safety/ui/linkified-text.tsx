import { Fragment, isValidElement, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { messages as noticeMessages } from "@/i18n/catalogs/components__notice__notice-body";
import { translate } from "@/i18n/messages";
import { splitLinks } from "../domain/linkify";
import styles from "./content.module.css";

/** Plain text of a string, or of the static renderer's text-node elements; null when the children hold any other element. */
function plainText(children: ReactNode): string | null {
  const parts = Array.isArray(children) ? children : [children];
  let text = "";
  for (const part of parts) {
    if (typeof part === "string") text += part;
    else if (isValidElement<{ node?: { type?: string | { name?: string }; text?: string } }>(part) && typeof part.props.node?.text === "string" && (part.props.node.type === "text" || (part.props.node.type as { name?: string } | undefined)?.name === "text")) text += part.props.node.text;
    else return null;
  }
  return text;
}

/** A web address inside user or official text. Opens in a new window; the shared outbound tracker adds UTM and click counting. */
export function BodyLink({ href, children, newWindowLabel, official = false }: { href: string; children: ReactNode; newWindowLabel?: string; official?: boolean }) {
  // The icon travels with the first character so a wrapped address never leaves the icon alone at the end of a line.
  const text = plainText(children);
  const [first = "", ...rest] = Array.from(text ?? "");
  return <a className={styles.bodyLink} href={href} target="_blank" rel={official ? "noopener noreferrer" : "noopener noreferrer nofollow ugc"} data-outbound-placement="content" data-outbound-kind="external">
    {text ? <><span className={styles.bodyLinkHead}><Link2 size={16} aria-hidden="true" />{first}</span>{rest.join("")}</> : <><Link2 size={16} aria-hidden="true" />{children}</>}
    {newWindowLabel && <span className={styles.srOnly}>{`, ${newWindowLabel}`}</span>}
  </a>;
}

const newWindowLabel = (locale: AppLocale) => locale === "ko" ? "새 창" : translate(locale, noticeMessages.m78f7fe6d9b7c, "opens in a new window");

export function LinkifiedText({ text, locale, official = false }: { text: string; locale: AppLocale; official?: boolean }) {
  const parts = splitLinks(text);
  if (parts.length === 1 && parts[0].type === "text") return <>{text}</>;
  return <>{parts.map((part, index) => part.type === "link"
    ? <BodyLink key={index} href={part.href} newWindowLabel={newWindowLabel(locale)} official={official}>{part.text}</BodyLink>
    : <Fragment key={index}>{part.text}</Fragment>)}</>;
}
