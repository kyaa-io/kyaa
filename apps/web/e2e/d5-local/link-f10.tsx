import type { AnchorHTMLAttributes, MouseEvent } from "react";
export default function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...rest} onClick={(e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault(); history.pushState({}, '', href); window.dispatchEvent(new Event('f10-nav'));
  }} />;
}
