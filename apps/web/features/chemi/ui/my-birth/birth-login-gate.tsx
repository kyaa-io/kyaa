"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanState } from "@/components/fan-ui/fan-state";
import { fanLoginHref } from "@/components/login-href";
import type { AppLocale } from "@/i18n/locales";
import type { MyBirthCopy } from "../frame/birth-copy";

/** 로그인하지 않았을 때: 로그인 한 곳으로 안내하고 돌아오면 이 화면이다. */
export function BirthLoginGate({ locale, copy }: Readonly<{ locale: AppLocale; copy: MyBirthCopy }>) {
  return <FanState kind="auth" title={copy.loginTitle} actions={<FanAction variant="primary" href={fanLoginHref(locale, `/my/birth?locale=${locale}`)}>{copy.login}</FanAction>} />;
}
