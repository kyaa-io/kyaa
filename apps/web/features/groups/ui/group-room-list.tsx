"use client";
import { useState, type ReactNode } from "react";
import { ChevronRight, LockKeyhole, MessageCircle, Search, UserRound } from "lucide-react";
import type { z } from "zod";
import Link from "next/link";
import type { Route } from "next";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import type { AppLocale } from "@/i18n/locales";
import { groupMessagesSchema, groupRoomsSchema } from "../domain/contracts";
import { groupsCopy } from "./copy";
import { GroupImage } from "./group-image";
import { roomContextCopy, roomEntryCopy } from "./room-entry-copy";
import { roomHubText } from "./room-hub-copy";
import styles from "./group-room-list.module.css";

type Room = z.infer<typeof groupRoomsSchema>["items"][number];
type Participant = NonNullable<z.infer<typeof groupMessagesSchema>["participants"]>[number];

/** 방이 이 수 이상일 때만 검색을 둔다. */
export const ROOM_SEARCH_MIN = 8;
const MAX_AVATARS = 12;
const isOpenNow = (room: Room) => room.canEnter && room.status === "open" && room.reason !== "jjinfan_required";
const isEnterable = (room: Room) => room.canEnter && ["open", "readonly"].includes(room.status) && room.reason !== "jjinfan_required";

/** 큰 카드에 올릴 방: 지금 들어갈 수 있는 방 중 대화 가능한 첫 방, 없으면 읽기 전용인 첫 방. */
export function pickFeaturedRoom(rooms: readonly Room[]) {
  return rooms.find(isOpenNow) ?? rooms.find(isEnterable);
}

function accessLabel(locale: AppLocale, tier: string | null | undefined, verified: boolean) {
  const entry = roomEntryCopy(locale);
  if (tier) return entry.minimum.replace("{tier}", tier);
  return verified ? entry.verified : roomHubText(locale, "joinedFans");
}

function RoomSearch({ locale, value, onChange }: { locale: AppLocale; value: string; onChange: (value: string) => void }) {
  const search = groupsCopy(locale).search;
  return <label className={styles.search}><Search size={20} aria-hidden="true"/><span className={styles.srOnly}>{search}</span><input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={search}/></label>;
}
const matches = (name: string, query: string, locale: AppLocale) => name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));

type ControlProps = { href?: string; onClick?: () => void; disabled?: boolean; label?: string; children: ReactNode };
/** 방 한 줄의 누르는 면. 링크, 버튼, 누르지 않는 표시 중 하나로 그린다. */
function RoomCardControl({ href, onClick, disabled, label, children }: ControlProps) {
  if (href) return <Link className={styles.cardMain} href={href as Route}>{children}</Link>;
  if (onClick || disabled) return <button className={styles.cardMain} type="button" aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>;
  return <div className={styles.cardMain} data-static="true">{children}</div>;
}

/** 지금 방에 있는 팬의 아바타 줄. 가로로 넘긴다. */
function RoomPeople({ people, locale }: { people: readonly Participant[]; locale: AppLocale }) {
  const shown = people.slice(0, MAX_AVATARS), rest = people.length - shown.length;
  return <section className={styles.people} aria-label={roomContextCopy[locale][0]}>
    <h3 className={styles.sectionTitle}>{roomContextCopy[locale][0]}<span className={styles.count}>{people.length.toLocaleString(locale)}</span></h3>
    <ul className={styles.avatars}>
      {shown.map(person => <li className={styles.person} key={person.profileId}>
        {person.avatarUrl ? <GroupImage src={person.avatarUrl} locale={locale} alt="" width={48} height={48} className={styles.avatar}/> : <span className={styles.avatar} aria-hidden="true"><UserRound size={22}/></span>}
        <span className={styles.personName}>{person.nickname}</span>
      </li>)}
      {rest > 0 && <li className={styles.person}><span className={`${styles.avatar} ${styles.more}`} aria-hidden="true">+{rest.toLocaleString(locale)}</span><span className={styles.srOnly}>{`+${rest}`}</span></li>}
    </ul>
  </section>;
}

type HubProps = {
  rooms: Room[]; locale: AppLocale; imageUrl?: string | null; statusLabels: Record<string, string>; unreadLabel: string;
  /** 슬러그가 있는 팬페이지면 인증이 필요한 방을 `팬 인증 완료`로 적는다. */
  verifiable?: boolean; proofHref?: string; people?: readonly Participant[]; onSelect: (room: Room) => void;
};

/** 가입한 팬의 비밀방: 아바타 줄, 큰 진행 중 카드, 다음 방 목록. */
export function GroupRoomHub({ rooms, locale, imageUrl, statusLabels, unreadLabel, verifiable = false, proofHref, people = [], onSelect }: HubProps) {
  const [query, setQuery] = useState("");
  const entry = roomEntryCopy(locale), featured = pickFeaturedRoom(rooms);
  const others = rooms.filter(room => room !== featured && matches(room.name, query, locale));
  const searchable = rooms.length >= ROOM_SEARCH_MIN;
  return <div className={styles.hub}>
    {featured && people.length > 0 && <RoomPeople people={people} locale={locale}/>}
    {featured && <section className={styles.featured} aria-label={featured.name} data-room-featured>
      <div className={styles.featuredBody}>
        <div className={styles.featuredTop}>
          {imageUrl ? <GroupImage src={imageUrl} locale={locale} alt="" width={40} height={40} className={styles.featuredImage}/> : null}
          <span className={styles.live} data-status={featured.status}><i aria-hidden="true"/>{statusLabels[featured.status]}</span>
          {Boolean(featured.unreadCount) && <span className={styles.unread}><span className={styles.srOnly}>{unreadLabel} </span><span aria-hidden="true">{featured.unreadCount}</span></span>}
        </div>
        <h3 className={styles.featuredName}>{featured.name}</h3>
        <p className={styles.featuredLast}>{featured.latestMessage || entry.empty}</p>
      </div>
      <FanAction className={styles.featuredAction} variant="primary" ariaLabel={`${featured.name} · ${roomHubText(locale, "enter")}`} trailingIcon={<ChevronRight aria-hidden="true"/>} onClick={() => onSelect(featured)}>{roomHubText(locale, "enter")}</FanAction>
    </section>}
    {(others.length > 0 || query) && <section className={styles.others}>
      {featured && <h3 className={styles.sectionTitle}>{roomHubText(locale, "otherRooms")}</h3>}
      {searchable && <RoomSearch locale={locale} value={query} onChange={setQuery}/>}
      {others.length ? <ul className={styles.grid}>{others.map(room => {
        const needsProof = room.reason === "jjinfan_required", enterable = isEnterable(room);
        const tier = accessLabel(locale, room.minimumTier, verifiable && (room.defaultKey === "artist" || room.defaultKey === "certified"));
        const sub = enterable ? room.latestMessage || entry.empty
          : needsProof ? [room.minimumTier, dukjilText(locale, "roomJjinfan")].filter(Boolean).join(" · ")
          : ["closed", "scheduled"].includes(room.status) ? [statusLabels[room.status], tier].join(" · ") : tier;
        return <li className={styles.card} key={room.id} data-locked={enterable ? undefined : "true"}>
          <RoomCardControl label={[room.name, sub, enterable && room.unreadCount ? `${unreadLabel} ${room.unreadCount}` : ""].filter(Boolean).join(" · ")} disabled={needsProof} onClick={() => onSelect(room)}>
            <span className={styles.icon} aria-hidden="true">{enterable ? <MessageCircle size={20}/> : <LockKeyhole size={20}/>}</span>
            <span className={styles.content}><strong>{room.name}</strong><span className={styles.preview}>{sub}</span></span>
            {enterable && Boolean(room.unreadCount) ? <span className={styles.unread} aria-hidden="true">{room.unreadCount}</span>
              : !needsProof && <span className={styles.trailing} aria-hidden="true">{enterable ? null : roomHubText(locale, "viewConditions")}<ChevronRight size={16}/></span>}
          </RoomCardControl>
          {needsProof && proofHref && <FanAction className={styles.proofLink} variant="neutral" href={proofHref}>{dukjilText(locale, "dukjilTileProof")}</FanAction>}
        </li>;
      })}</ul> : <p className={styles.empty}>{groupsCopy(locale).empty}</p>}
    </section>}
  </div>;
}

/** 가입하지 않은 사람이 보는 비밀방 목록. 방 이름과 입장 등급만 있고 방 안 내용은 없다. 줄을 누르면 로그인이나 가입으로 간다. */
export function GroupPublicRoomList({ rooms, locale, rowHref, onRowClick }: { rooms: { name: string; minimumTier: string | null }[]; locale: AppLocale; rowHref?: string; onRowClick?: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = rooms.filter(room => matches(room.name, query, locale));
  const searchable = rooms.length >= ROOM_SEARCH_MIN;
  return <div className={styles.hub}>
    {searchable && <RoomSearch locale={locale} value={query} onChange={setQuery}/>}
    {filtered.length ? <ul className={styles.grid}>{filtered.map((room, index) => {
      const body: ReactNode = <>
        <span className={styles.icon} aria-hidden="true"><LockKeyhole size={20}/></span>
        <span className={styles.content}><strong>{room.name}</strong><span className={styles.preview}>{accessLabel(locale, room.minimumTier, false)}</span></span>
        <span className={styles.trailing} aria-hidden="true"><ChevronRight size={16}/></span>
      </>;
      return <li className={styles.card} data-locked="true" key={index}>
        <RoomCardControl href={rowHref} onClick={onRowClick}>{body}</RoomCardControl>
      </li>;
    })}</ul> : rooms.length ? <p className={styles.empty}>{groupsCopy(locale).empty}</p> : null}
  </div>;
}

/** 비밀방 목록 자리의 골격. 큰 카드 한 장과 방 줄 둘의 높이를 미리 차지한다. */
export function GroupRoomHubSkeleton({ label, featured = true, rows = 2 }: { label: string; featured?: boolean; rows?: number }) {
  return <div className={styles.hub} role="status" aria-busy="true" aria-label={label} data-fan-skeleton="rooms">
    {featured && <div className={styles.featured} aria-hidden="true">
      <div className={styles.featuredBody}><FanSkeleton width={96} height={24}/><FanSkeleton width="48%" height={24}/><FanSkeleton width="72%" height={21}/></div>
      <FanSkeleton shape="block" width={132} height={48} className={styles.skeletonAction}/>
    </div>}
    <ul className={styles.grid} aria-hidden="true">{Array.from({ length: rows }, (_, index) => <li className={styles.card} key={index}><div className={styles.cardMain}><FanSkeleton shape="circle" width={40} height={40}/><span className={styles.content}><FanSkeleton width="50%" height={20}/><FanSkeleton width="35%" height={16}/></span></div></li>)}</ul>
  </div>;
}
