import { FanText } from "@/components/fan-ui/fan-text";

import { extraGameUnit } from "@/features/chemi/ui/extra-play-copy";

export function SpentPoints({ points }: { points: number }) {
  return <FanText role="label"><span role="status">−{points}{extraGameUnit(points)}</span></FanText>;
}
