/** Capsule colours of the approved prototype. Shared by the 3D scene and the pre-rendered thumbnails (capsule-{index}-closed|open.webp). */
export const CAPSULE_COLORS = ["#f27fae", "#b79cf0", "#f2c98f", "#ff9ec4", "#e8478a", "#8fd0f0", "#ffc2da"] as const;
/** 0 no prize, 1 prize, 2 rare prize. */
export type CapsuleLevel = 0 | 1 | 2;
export type CapsuleOutcome = { level: CapsuleLevel; imageUrl: string | null };
