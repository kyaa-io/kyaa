"use client";

import * as Popover from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import styles from "./header-popover.module.css";

/** Shared, non-modal header popover. Radix owns trigger ARIA, positioning, dismissal and focus restoration.
 * Trigger/Close accept native button props; use Close asChild for a link that forwards props and its ref. */
function Root(props: ComponentPropsWithoutRef<typeof Popover.Root>) {
  return <Popover.Root modal={false} {...props} />;
}

const Trigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof Popover.Trigger>>(
  function HeaderPopoverTrigger(props, ref) {
    return <Popover.Trigger ref={ref} type="button" {...props} />;
  },
);

const Content = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Popover.Content> & { label: string }>(
  function HeaderPopoverContent({ label, className, children, ...props }, ref) {
    return <Popover.Portal>
      <Popover.Content ref={ref} align="end" sideOffset={8} collisionPadding={16}
        aria-label={label} {...props} className={[styles.content, className].filter(Boolean).join(" ")}>
        {children}
      </Popover.Content>
    </Popover.Portal>;
  },
);

const Close = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof Popover.Close>>(
  function HeaderPopoverClose(props, ref) {
    return <Popover.Close ref={ref} type="button" {...props} />;
  },
);

export const HeaderPopover = { Root, Trigger, Content, Close };
