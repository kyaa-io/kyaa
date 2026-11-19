"use client";
import { FanText } from "@/components/fan-ui/fan-text";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { birthIsoToText } from "@/features/chemi/domain/birth-form";
import { chemiProfileResponseSchema } from "@/features/chemi/domain/contracts/profile";
import type { AppLocale } from "@/i18n/locales";
import { chemiMyShortcutText } from "../copy";
import styles from "./my-birth-shortcut-detail.module.css";

const parse = (value: unknown) => chemiProfileResponseSchema.parse(value);

/** MY 바로가기 '내 생일 정보' 줄 아래 값: 저장된 생년월일, 없으면 '입력 전'. 읽는 동안·실패하면 자리만 비운다. */
export function MyBirthShortcutDetail({ locale }: Readonly<{ locale: AppLocale }>) {
  const auth = useByUsAuth();
  const { state } = useOwnedFanResource("/api/chemi/profile", parse, auth);
  if (state.status !== "ready") return null;
  const birth = state.data.birth;
  return <FanText as="div" role="meta" className={birth ? styles.value : undefined}>{birth ? birthIsoToText(birth.birthDate) : chemiMyShortcutText(locale).none}</FanText>;
}
