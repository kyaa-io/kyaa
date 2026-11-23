import { FanText } from "@/components/fan-ui/fan-text";

export function SpentPoints({ points }: { points: number }) {
  return <FanText role="label"><span role="status">−{points}P</span></FanText>;
}
