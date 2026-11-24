import { FanIcon } from "@/components/fan-ui/fan-icon";
import { CircleUserRound } from "@/components/fan-ui/fan-icons";

/** 랭킹 원 안의 첫 글자. 닉네임이 없어 이름이 '팬'으로 대신 적히면 원 안은 사람 모양으로 둔다('팬 팬' 겹침 방지). */
export function RankInitial({ nickname }: { nickname: string | null | undefined }) {
  const name = nickname?.trim();
  return name ? <>{Array.from(name)[0]}</> : <FanIcon icon={CircleUserRound} size={16} />;
}

export function RankAvatar({ nickname, url }: { nickname?: string | null; url?: string | null }) {
  return url
    ? <img src={url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
    : <RankInitial nickname={nickname} />;
}
