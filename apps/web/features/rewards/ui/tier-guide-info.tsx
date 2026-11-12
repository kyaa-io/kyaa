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
export function TierGuideInfo({locale}: {locale: AppLocale}) {
  const [open,setOpen] = useState(false);
  const router = useRouter(); const c = tierGuideCopy(locale);
  return <><FanIconButton type="button" className={styles.info} aria-label={c.title} aria-haspopup="dialog" onClick={()=>setOpen(true)}><FanIcon icon={Info} size={20} /></FanIconButton><FanDialog open={open} onOpenChange={setOpen} title={c.prompt} closeLabel={c.close} size="sm" primary={{label:c.view,onClick:()=>{setOpen(false);router.push(`/notices/tier-guide?locale=${locale}`);}}} /></>;
}
