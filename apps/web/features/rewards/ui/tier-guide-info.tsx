"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import type { AppLocale } from "@/i18n/locales";
import { tierGuideCopy } from "./tier-guide-copy";
import styles from "./tier-guide.module.css";

/** 등급 체계 안내 팝업("등급 체계를 알아볼까요?" → 안내 페이지). (i) 버튼과 MY 숫자 줄의 등급 칸이 같은 팝업을 연다. */
export function TierGuideDialog({locale, open, onOpenChange}: {locale: AppLocale; open: boolean; onOpenChange: (open: boolean) => void}) {
  const router = useRouter(); const c = tierGuideCopy(locale);
  return <FanDialog open={open} onOpenChange={onOpenChange} title={c.prompt} closeLabel={c.close} size="sm" primary={{label:c.view,navigates:true,onClick:()=>{onOpenChange(false);router.push(`/notices/tier-guide?locale=${locale}`);}}} />;
}

export function TierGuideInfo({locale}: {locale: AppLocale}) {
  const [open,setOpen] = useState(false);
  const c = tierGuideCopy(locale);
  return <><FanIconButton type="button" className={styles.info} aria-label={c.title} aria-haspopup="dialog" onClick={()=>setOpen(true)}><FanIcon icon={Info} size={20} /></FanIconButton><TierGuideDialog locale={locale} open={open} onOpenChange={setOpen} /></>;
}
