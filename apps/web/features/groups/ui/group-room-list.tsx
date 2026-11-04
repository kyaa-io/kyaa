"use client";
import { useState } from "react";
import { LockKeyhole, MessageCircle, Search } from "lucide-react";
import type { z } from "zod";
import type { AppLocale } from "@/i18n/locales";
import { groupRoomsSchema } from "../domain/contracts";
import { groupsCopy } from "./copy";
import { GroupImage } from "./group-image";
import { roomEntryCopy } from "./room-entry-copy";
import styles from "./group-room-list.module.css";
type Room = z.infer<typeof groupRoomsSchema>["items"][number];
type Props = { rooms: Room[]; locale: AppLocale; imageUrl?: string | null; statusLabels: Record<string, string>; unreadLabel: string; onSelect: (room: Room) => void };
export function GroupRoomList({ rooms, locale, imageUrl, statusLabels, unreadLabel, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const search = groupsCopy(locale).search;
  const filtered = rooms.filter(room => room.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  return <div className={styles.list}>
    <label className={styles.search}><Search size={20} aria-hidden="true"/><span className={styles.srOnly}>{search}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={search}/></label>
    {filtered.length ? filtered.map(room => {
      const visible = room.canEnter && ["open", "readonly"].includes(room.status);
      const preview = visible ? room.latestMessage || roomEntryCopy(locale).empty : [!room.canEnter && room.status === "open" ? roomEntryCopy(locale).title : statusLabels[room.status], room.minimumTier].filter(Boolean).join(" · ");
      return <button className={styles.row} key={room.id} type="button" aria-label={[room.name, preview, visible && room.unreadCount ? `${unreadLabel} ${room.unreadCount}` : ""].filter(Boolean).join(" · ")} onClick={() => onSelect(room)}>
        {imageUrl ? <GroupImage src={imageUrl} locale={locale} alt="" width={56} height={56} className={styles.image}/> : <span className={styles.image} aria-hidden="true">{visible ? <MessageCircle size={24}/> : <LockKeyhole size={24}/>}</span>}
        <span className={styles.content}><strong>{room.name}</strong><span className={styles.preview}>{preview}</span></span>
        {visible && Boolean(room.unreadCount) && <span className={styles.unread} aria-hidden="true">{room.unreadCount}</span>}
      </button>;
    }) : <p className={styles.empty}>{groupsCopy(locale).empty}</p>}
  </div>;
}
