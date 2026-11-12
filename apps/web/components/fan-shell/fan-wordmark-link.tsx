import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__fan-shell__fan-wordmark-link";
import { translate } from "@/i18n/messages";
import Image from "next/image";
import type { Route } from "next";
import Link from "../fan-ui/hover-prefetch-link";

type FanWordmarkLinkProps = {
  className?: string;
  href?: Route;
  locale?: AppLocale;
  ariaLabel?: string;
  priority?: boolean;
};

export function FanWordmarkLink({
  className,
  href,
  locale,
  ariaLabel,
  priority = true,
}: FanWordmarkLinkProps) {
  const resolvedHref: string = href ?? (locale ? `/?locale=${locale}` : "/");
  const resolvedAriaLabel = ariaLabel ?? (!locale || locale === "ko" ? "kyaa 홈" : translate(locale ?? "en", localizedMessages.mae9332c916d9, "kyaa home"));

  return (
    <Link className={className} href={resolvedHref as Route} aria-label={resolvedAriaLabel}>
      <Image
        src="/images/guest-home/kyaa-wordmark.svg"
        alt="kyaa"
        width={80}
        height={39}
        style={{ height: "auto" }}
        priority={priority}
      />
    </Link>
  );
}
