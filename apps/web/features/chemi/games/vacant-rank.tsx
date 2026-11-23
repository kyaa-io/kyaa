import { FanText } from "@/components/fan-ui/fan-text";

export function VacantRank({ place, avatarClassName }: { place: number; avatarClassName: string }) {
  return <>
    <FanText role="body">{place}</FanText>
    <span className={avatarClassName} aria-hidden="true" />
    <FanText role="item">—</FanText>
    <FanText role="body">0</FanText>
  </>;
}
