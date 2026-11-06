import type { Route } from "next";

import type { AppLocale } from "../i18n/locales";
import { appendLoginContext } from "./login-intent";

/** 로그인 링크. `returnTo`는 현재 경로·쿼리·해시이며, 외부 주소는 `/`로 정리된다. */
export function fanLoginHref(locale: AppLocale, returnTo: string): Route {
  return appendLoginContext("/login", { returnTo, intent: null, entity: null, locale }) as Route;
}
