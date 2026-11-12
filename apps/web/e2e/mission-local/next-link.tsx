import type { AnchorHTMLAttributes } from "react";

type NextOnlyProps = { prefetch?: boolean | null; replace?: boolean; scroll?: boolean; shallow?: boolean; passHref?: boolean; legacyBehavior?: boolean; locale?: string | false };

// Harness stand-in for next/link: keeps anchor behavior and drops Next-only props that React would warn about on a DOM node.
export default function Link({ prefetch: _prefetch, replace: _replace, scroll: _scroll, shallow: _shallow, passHref: _passHref, legacyBehavior: _legacyBehavior, locale: _locale, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & NextOnlyProps) {
  return <a {...props} />;
}
