import type { ComponentProps, ReactNode } from "react";
import Link from "../fan-ui/hover-prefetch-link";

import styles from "./fan-navigation.module.css";
import { IntentRoutePrefetch } from "./intent-route-prefetch";

type LinkHref = ComponentProps<typeof Link>["href"];

export type FanNavigationItem = {
  href: LinkHref;
  icon?: ReactNode;
  id: string;
  isCurrent?: boolean;
  label: ReactNode;
  /** A small mark drawn over the item (the new-gift dot on MY). It positions itself against the item. */
  badge?: ReactNode;
};

type FanNavigationProps = {
  activeItemClassName?: string;
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
  items: readonly FanNavigationItem[];
};

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function FanPrimaryNavigation({
  activeItemClassName,
  ariaLabel,
  className,
  itemClassName,
  items,
}: FanNavigationProps) {
  return (
    <nav className={className} aria-label={ariaLabel}>
      {items.map((item) => (
        <Link
          key={item.id}
          data-fan-navigation-id={item.id}
          className={classNames(
            styles.navigationItem,
            itemClassName,
            item.isCurrent ? activeItemClassName : undefined,
          )}
          aria-current={item.isCurrent ? "page" : undefined}
          href={item.href}
          // The main tabs are dynamic pages with no loading boundary: the default prefetch reads nothing ahead. They are read whole when a pointer, touch or focus reaches the tab.
          prefetch={false}
        >
          {item.icon}
          {item.label}
          {item.badge}
        </Link>
      ))}
      <IntentRoutePrefetch hrefs={items.flatMap((item) => !item.isCurrent && typeof item.href === "string" ? [item.href] : [])} />
    </nav>
  );
}

export function FanBottomNavigation(props: FanNavigationProps) {
  return (
    <FanPrimaryNavigation
      {...props}
      itemClassName={classNames(styles.bottomNavigationItem, props.itemClassName)}
    />
  );
}

type FanLocaleLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: LinkHref;
};

export function FanLocaleLink({ className, ...props }: FanLocaleLinkProps) {
  return <Link className={classNames(styles.localeLink, className)} {...props} />;
}
