import type { ImgHTMLAttributes } from "react";

export const REWARD_ICON_SRC = {"point": "/images/economy/point-coin.webp", "heart": "/images/dukjil-duo/glyph-heart-160.webp", "ticket": "/images/dukjil-duo/glyph-ticket-160.webp", "stamp": "/images/dukjil-duo/glyph-stamp-160.webp"} as const;
export type RewardKind = keyof typeof REWARD_ICON_SRC;

export function RewardIcon({ kind, size = 16, width = size, height = size, alt = "", ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & { kind: RewardKind; size?: number }) {
  return <img data-reward-kind={kind} src={REWARD_ICON_SRC[kind]} width={width} height={height} alt={alt} {...props} />;
}
