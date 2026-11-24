import { FanText } from "@/components/fan-ui/fan-text";

export function VacantRank({ place, label, avatarClassName }: { place: number; label: string; avatarClassName: string }) {
  return <>
    <FanText role="body">{place}</FanText>
    <span className={avatarClassName} aria-hidden="true" />
    <FanText role="item"><span role="img" aria-label={label}>{label}</span></FanText>
  </>;
}
