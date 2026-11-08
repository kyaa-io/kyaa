"use client";

import { CalendarIcon } from "@animateicons/react/lucide/calendar-icon";
import { TicketIcon } from "@animateicons/react/lucide/ticket-icon";
import { GiftIcon } from "@animateicons/react/lucide/gift-icon";
import { RadioIcon } from "@animateicons/react/lucide/radio-icon";

/** Motion을 끌고 오는 움직이는 아이콘. `fan-motion-icon.tsx`가 아이콘이 화면에 보일 때만 불러온다. */
export const animatedIcons = { calendar: CalendarIcon, ticket: TicketIcon, gift: GiftIcon, radio: RadioIcon };
