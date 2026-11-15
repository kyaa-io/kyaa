"use client";

import { Share2 } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { communityShareLinkSchema } from "@/features/community-stamps/domain/community-stamps";
import { communityStampAction } from "@/features/community-stamps/ui/use-community-stamps";
import type { AppLocale } from "@/i18n/locales";
import { passportShareText, passportShareUrl, X_SHARE_HASHTAGS, xPostIntentUrl } from "../domain/passport-x-share";

/**
 * "Share on X" for an issued Passport. The share link is the member's one link for this creator (the server returns the same token every time), so it
 * is read when the button appears and the button is a plain outbound link: X opens on the click itself, and the shared outbound-link tracker adds the
 * UTM values and counts the click. Without a link (not signed in, no Passport, a failed read) nothing is drawn.
 */
export function PassportXShare({ creator, locale, size, fullWidth }: { creator: { slug: string; name: string }; locale: AppLocale; size?: "sm"; fullWidth?: boolean }) {
  const { ready, authenticated, getAccessToken } = useByUsAuth();
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !authenticated) return;
    let alive = true;
    communityStampAction(getAccessToken, "share-link", { creator: creator.slug }, (value) => communityShareLinkSchema.parse(value))
      .then(({ token }) => { if (alive) setHref(xPostIntentUrl({ text: passportShareText(locale, creator.name), url: passportShareUrl(window.location.origin, token, locale), hashtags: X_SHARE_HASHTAGS })); })
      .catch(() => { /* The share button is optional: the Passport itself stays usable. */ });
    return () => { alive = false; };
  }, [ready, authenticated, getAccessToken, creator.slug, creator.name, locale]);
  if (!href) return null;
  return <span data-outbound-kind="social" data-outbound-placement="content">
    <FanAction variant="secondary" size={size} fullWidth={fullWidth} href={href} external leadingIcon={<FanIcon icon={Share2} size={16} />}>{locale === "ko" ? "X에 공유" : "Share on X"}</FanAction>
  </span>;
}
