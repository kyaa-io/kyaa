"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  useId,
  type ButtonHTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from "react";

import {useGroupsRelease} from "@/features/groups/ui/groups-release";
import styles from "./fan-action.module.css";

export type FanActionVariant =
  | "primary"
  | "neutral"
  | "text"
  | "service"
  | "passport";

export function fanActionClassName(
  variant: FanActionVariant,
  options: { fullWidth?: boolean; className?: string } = {},
) {
  return [
    styles.action,
    styles[variant],
    options.fullWidth ? styles.fullWidth : "",
    options.className ?? "",
  ].filter(Boolean).join(" ");
}

type FanActionProps = Readonly<{
  /** Omit for an icon-only action; then aria-label is required. */
  children?: ReactNode;
  variant?: FanActionVariant;
  fullWidth?: boolean;
  className?: string;
  "aria-current"?: ButtonHTMLAttributes<HTMLButtonElement>["aria-current"];
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  "aria-pressed"?: boolean;
  "aria-disabled"?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  helperText?: ReactNode;
}> & (
  | Readonly<{
      href: string;
      external?: boolean;
      target?: "_blank";
      rel?: string;
      onClick?: MouseEventHandler<HTMLAnchorElement>;
      type?: never;
      disabled?: never;
    }>
  | Readonly<{
      href?: never;
      external?: never;
      target?: never;
      rel?: never;
      onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
      type?: "button" | "submit";
      disabled?: boolean;
      ariaBusy?: boolean;
      /** Disables the control, keeps its label/width and shows a spinner. */
      loading?: boolean;
    }>
);

export function FanAction({
  children,
  variant = "neutral",
  fullWidth,
  className,
  ariaLabel,
  ariaDescribedBy,
  leadingIcon,
  trailingIcon,
  helperText,
  ...props
}: FanActionProps) {
  const groupsEnabled=useGroupsRelease();
  const generatedHelperId = useId();
  const helperId = helperText ? generatedHelperId : undefined;
  const describedBy = [ariaDescribedBy, helperId].filter(Boolean).join(" ") || undefined;
  const actionClassName = fanActionClassName(variant, { fullWidth, className: [groupsEnabled?styles.groups:"",children==null?styles.iconOnly:"",className].filter(Boolean).join(" ") });
  const isLoading = "loading" in props && Boolean(props.loading);
  const content = (
    <>
      {leadingIcon ? <span className={styles.leading} aria-hidden="true">{leadingIcon}</span> : null}
      {children==null?null:<span className={styles.label}>{children}</span>}
      {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : trailingIcon ? <span className={styles.trailing} aria-hidden="true">{trailingIcon}</span> : null}
    </>
  );

  let control: ReactNode;
  // The link branch cannot be disabled or loading: a link that cannot navigate must not render as a FanAction link.
  if ("href" in props && props.href) {
    const linkProps = props as Extract<FanActionProps, { href: string }>;
    const commonProps = {
      className: actionClassName,
      "aria-current": props["aria-current"],
      "aria-expanded": props["aria-expanded"],
      "aria-controls": props["aria-controls"],
      "aria-label": ariaLabel,
      "aria-describedby": describedBy,
      "data-fan-action": "",
      "data-fan-action-emphasis": variant === "primary" ? "primary" : undefined,
      "data-has-leading": leadingIcon ? "true" : undefined,
      "data-has-trailing": trailingIcon ? "true" : undefined,
      onClick: linkProps.onClick,
    } as const;

    control = linkProps.external ? (
      <a
        {...commonProps}
        href={linkProps.href}
        target={linkProps.target ?? "_blank"}
        rel={linkProps.rel ?? "noopener noreferrer"}
      >
        {content}
      </a>
    ) : (
      <Link {...commonProps} href={linkProps.href as Route}>
        {content}
      </Link>
    );
  } else {
    const buttonProps = props as Extract<FanActionProps, { href?: never }>;
    control = (
      <button
        className={actionClassName}
        type={buttonProps.type ?? "button"}
        onClick={buttonProps.onClick}
        disabled={buttonProps.disabled || buttonProps.loading}
        aria-busy={buttonProps.ariaBusy || buttonProps.loading || undefined}
        data-loading={buttonProps.loading ? "true" : undefined}
        aria-current={props["aria-current"]}
        aria-pressed={props["aria-pressed"]}
        aria-disabled={props["aria-disabled"]}
        aria-expanded={props["aria-expanded"]}
        aria-controls={props["aria-controls"]}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        data-fan-action=""
        data-fan-action-emphasis={variant === "primary" ? "primary" : undefined}
        data-has-leading={leadingIcon ? "true" : undefined}
        data-has-trailing={trailingIcon ? "true" : undefined}
      >
        {content}
      </button>
    );
  }

  if (!helperText) return control;

  return (
    <div className={styles.actionBlock}>
      {control}
      <p className={styles.helper} id={helperId}>{helperText}</p>
    </div>
  );
}
