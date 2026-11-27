"use client";

import { AlertCircle, LoaderCircle, ShieldAlert } from "lucide-react";
import type { Route } from "next";
import Link from "../fan-ui/hover-prefetch-link";
import { usePathname } from "next/navigation";
import styles from "./operations.module.css";

export function AdminAccessState({ status, locale }: { status: "loading" | "unauthenticated" | "denied"; locale: "ko" | "en" }) {
  const ko = locale === "ko";
  // 로그인 뒤 보던 관리자 화면으로 돌아오도록 지금 주소를 넘긴다(2회차 버튼 표: 복귀 주소 없음).
  const pathname = usePathname() || "/admin";
  const login = `/admin/login?${new URLSearchParams({ ...(locale === "en" ? { lang: "en" } : {}), returnTo: pathname }).toString()}`;
  const content = status === "loading"
    ? { icon: <LoaderCircle className={styles.spin} aria-hidden="true" />, title: ko ? "권한 확인 중" : "Checking admin access", body: ko ? "잠시만 기다려 주세요." : "We are verifying your secure operations session." }
    : status === "unauthenticated"
      ? { icon: <ShieldAlert aria-hidden="true" />, title: ko ? "관리자 로그인이 필요해요" : "Admin sign-in required", body: ko ? "로그인하면 관리자 화면이 열려요." : "Operations data is available only to verified administrators." }
      : { icon: <AlertCircle aria-hidden="true" />, title: ko ? "권한을 확인할 수 없어요" : "Access could not be verified", body: ko ? "다시 로그인해 주세요." : "Confirm your active admin access and try again." };
  return <main className={styles.accessPage}><section className={styles.accessPanel} aria-live="polite">{content.icon}<h1>{content.title}</h1><p>{content.body}</p>{status !== "loading" && <Link className={styles.primaryLink} href={login as Route}>{ko ? "관리자 로그인" : "Admin sign in"}</Link>}</section></main>;
}

