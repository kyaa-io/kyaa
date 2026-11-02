"use client";

import {useState} from 'react';
import {GroupLanguageDialog} from '@/features/groups/ui/group-language-dialog';
import {rememberOverlayTrigger} from '@/components/ui/overlay/focus-return';
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { APP_LOCALES, APP_LOCALE_NATIVE_NAMES, LANGUAGE_SELECTOR_ARIA_LABELS, isAppLocale, type AppLocale } from "../../i18n/locales";
import { withLocalePath } from "../locale-path";
import styles from "./fan-language-switch.module.css";

export function FanLanguageSwitch({
  locale,
  href,
  ariaLabel,
  taskDialog=false,
}: {
  locale: AppLocale;
  href: string;
  ariaLabel?: string;
  taskDialog?: boolean;
}) {
  const router = useRouter(),[open,setOpen]=useState(false);
  // Legacy callers describe a binary KO/EN toggle, so the language control owns its label.
  void ariaLabel;
  if(taskDialog)return <><button type='button' className={styles.trigger} data-fan-language-action aria-label={LANGUAGE_SELECTOR_ARIA_LABELS[locale]} aria-haspopup='dialog' aria-expanded={open} onClick={event=>{rememberOverlayTrigger(event.currentTarget);setOpen(true);}}><Languages aria-hidden/><span className={styles.value}>{APP_LOCALE_NATIVE_NAMES[locale]}</span><span className={styles.icon}><ChevronDown aria-hidden/></span></button>{open&&<GroupLanguageDialog locale={locale} href={href} onClose={()=>setOpen(false)}/>}</>;
  return (
    <Select.Root
      value={locale}
      onValueChange={(next) => {
        if (isAppLocale(next) && next !== locale) router.push(withLocalePath(href, next) as Route);
      }}
    >
      <Select.Trigger
        className={styles.trigger}
        data-fan-language-action
        aria-label={LANGUAGE_SELECTOR_ARIA_LABELS[locale]}
        value={locale}
      >
        <Languages aria-hidden="true" />
        <Select.Value className={styles.value}>{APP_LOCALE_NATIVE_NAMES[locale]}</Select.Value>
        <Select.Icon className={styles.icon}><ChevronDown aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className={styles.positioner} sideOffset={8} align="end" alignItemWithTrigger={false}>
          <Select.Popup className={styles.popup}>
            <Select.List className={styles.list}>
              {APP_LOCALES.map((option) => (
                <Select.Item className={styles.item} key={option} value={option}>
                  <Select.ItemText>{APP_LOCALE_NATIVE_NAMES[option]}</Select.ItemText>
                  <Select.ItemIndicator className={styles.indicator}>
                    <Check aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
