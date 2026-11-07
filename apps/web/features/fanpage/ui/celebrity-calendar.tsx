"use client";
import { dropResource, peekResource, shareResourceRead, syncResourceOwner } from "@/components/fan-ui/resource-cache";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { useScheduleMonth } from "@/features/schedules/ui/use-schedule-month";
import { combinedCalendarDays } from "@/features/schedules/domain/calendar-entries";
import { ParticipationState } from "@/features/schedules/ui/participation-ui";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { toContentLocale } from "@/i18n/locales";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/features__fanpage__ui__celebrity-calendar";
import { additionalLocales, translate } from "@/i18n/messages";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "@/components/icons";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { FanMotionIcon } from "@/components/fan-ui/fan-motion-icon";
import { CalendarDayNumber, CalendarMonthHeader } from "@/components/fan-calendar/calendar-parts";
import { liveCalendarMonthSchema, type LiveCalendarDay } from "@/features/live/domain/live-calendar";
import { LiveReservationLegend, LiveReservationMark } from "@/features/live/ui/live-reservation-mark";
import { LiveTimeIndicator } from "@/features/live/ui/live-time-indicator";
import { DailyCheckin } from "@/features/community-stamps/ui/daily-checkin";
import type { PublishedCelebrity, PublishedCelebrityLive, ContentLocale } from "@/server/content/content-domain";
import styles from "./calendar.module.css";
import dailyStyles from "@/features/community-stamps/ui/daily-checkin.module.css";
type AsyncState<T> = { status: "idle" | "loading" } | { status: "ready"; data:T } | {status:"error"};
export const miniCalendarCopy = {
ko: { calendarTitle:"LIVE 일정", calendarOpen:"캘린더 크게 보기", calendarLoading:"LIVE 일정을 확인하고 있어요", calendarError:"일정을 불러오지 못했어요.", calendarUpcoming:"다가오는 일정", calendarUpcomingEmpty:"이번 달에는 예정된 LIVE가 없어요.", previousMonth:"이전 달", nextMonth:"다음 달", weekdays:["일","월","화","수","목","금","토"] },
en: { calendarTitle:"LIVE schedule", calendarOpen:"Open full calendar", calendarLoading:"Checking LIVE schedule", calendarError:"We couldn't load the schedule.", calendarUpcoming:"Upcoming", calendarUpcomingEmpty:"No upcoming LIVE this month.", previousMonth:"Previous month", nextMonth:"Next month", weekdays:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] }
,
  ...additionalLocales((translationLocale) => ({ calendarTitle:localizedMessages.m7f1d81ff4af0[translationLocale], calendarOpen:localizedMessages.m60a10a47cbd4[translationLocale], calendarLoading:localizedMessages.me0eacb0fb2fa[translationLocale], calendarError:localizedMessages.m6c136ac58bb7[translationLocale], calendarUpcoming:localizedMessages.m626938c7444d[translationLocale], calendarUpcomingEmpty:localizedMessages.m485405428e90[translationLocale], previousMonth:localizedMessages.m0351b88b33a5[translationLocale], nextMonth:localizedMessages.mb4d0abcae301[translationLocale], weekdays:[localizedMessages.m7c2166ebd1f5[translationLocale],localizedMessages.m59b63ad67ef4[translationLocale],localizedMessages.mdd059499b529[translationLocale],localizedMessages.m9665850eb016[translationLocale],localizedMessages.m480b5a0ef7fc[translationLocale],localizedMessages.m8745d57d92fa[translationLocale],localizedMessages.m6d6077913c94[translationLocale]] }))
} as const;
export function formatMiniCalendarDate(value: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, { calendar: "gregory",
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function currentKstDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { calendar: "gregory",
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul",
  }).format(now);
}

function kstMonthForInstant(value: string) {
  return new Intl.DateTimeFormat("en-CA", { calendar: "gregory",
    year: "numeric", month: "2-digit", timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function miniCalendarMonthLabel(month: string, locale: AppLocale) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { calendar: "gregory",
    year: "numeric", month: "long", timeZone: "Asia/Seoul",
  }).format(new Date(Date.UTC(year!, monthNumber! - 1, 15)));
}

export function adjacentCalendarMonth(month: string, offset: -1 | 1) {
  const [year, monthNumber] = month.split("-").map(Number);
  const adjacent = new Date(Date.UTC(year!, monthNumber! - 1 + offset, 1));
  return `${adjacent.getUTCFullYear()}-${String(adjacent.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calendarWeekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
}

function emptyCalendarDays(month: string): LiveCalendarDay[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return Array.from({ length: dayCount }, (_, index) => ({
    date: `${month}-${String(index + 1).padStart(2, "0")}`,
    events: [],
  }));
}
/** 일정이 있는 날짜 칸. 팬페이지와 모임의 사이드 달력이 같이 쓴다. */
export function MiniCalendarEventDay({ date, today, count, upcoming, checkedIn = false, pressed, controls, label, style, onClick }: { date: string; today: string; count: number; upcoming: boolean; checkedIn?: boolean; pressed: boolean; controls: string; label: string; style?: CSSProperties; onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.calendarEventDay}
      data-upcoming={upcoming ? "true" : undefined}
      data-multiple={count > 1 ? "true" : undefined}
      data-today={date === today ? "true" : undefined}
      data-checked-in={checkedIn ? "true" : undefined}
      aria-pressed={pressed}
      aria-controls={controls}
      onClick={onClick}
      aria-label={label}
    >
      <CalendarDayNumber date={date} today={today} />
      <span aria-hidden="true">{count > 1 ? count : ""}</span>
      {checkedIn ? <i className={dailyStyles.checkinMark} aria-hidden="true">✓</i> : null}
    </button>
  );
}

export function CelebrityMiniCalendar({
  celebrity,
  locale,
  upcomingLive,
  embedded = false,
  onMonthChange,
}: {
  celebrity: PublishedCelebrity;
  locale: AppLocale;
  upcomingLive: PublishedCelebrityLive | null;
  embedded?: boolean;
  onMonthChange?: (month: string) => void;
}) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const session = useByUsSession();
  const requestAuthenticated = ready && session.ready && authenticated;
  const ownerScope = `${requestAuthenticated ? session.ownerId ?? user?.id ?? "guest" : "guest"}:${session.generation}`;
  const t = miniCalendarCopy[locale];
  const today = currentKstDate();
  const currentMonth = today.slice(0, 7);
  const upcomingMonth = upcomingLive ? kstMonthForInstant(upcomingLive.startsAt) : null;
  const initialMonth = upcomingMonth && upcomingMonth >= currentMonth ? upcomingMonth : currentMonth;
  const [month, setMonth] = useState(initialMonth);
  const schedules = useScheduleMonth(month, locale, celebrity.slug);
  const participation = participationCopy(locale);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [state, setState] = useState<AsyncState<LiveCalendarDay[]>>({ status: "loading" });
  const [checkedDates, setCheckedDates] = useState<readonly string[]>([]);
  const refreshController = useRef<AbortController | null>(null);

  useEffect(() => {
    setMonth(initialMonth);
  }, [initialMonth]);

  useEffect(() => { onMonthChange?.(month); }, [month, onMonthChange]);

  const abortCalendarRefresh = useCallback(() => {
    refreshController.current?.abort();
    refreshController.current = null;
  }, []);

  const refreshCalendar = useCallback(async (force = false) => {
    abortCalendarRefresh();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const url = `/api/live-events/calendar?month=${month}&locale=${toContentLocale(locale)}&identity=1`;
      const cacheKey = `calendar:${ownerScope}:${url}`;
      // While a session is still settling this is a guest read under its own key; the owner is recorded once it settles.
      if (!authenticated || session.ready) syncResourceOwner(ownerScope);
      if (force) dropResource(cacheKey);
      const stored = peekResource(cacheKey);
      const body = stored?.fresh ? stored.value : await shareResourceRead(cacheKey, async (signal) => {
        const token = requestAuthenticated ? await getAccessToken() : null;
        if (requestAuthenticated && !token) throw new Error("Calendar authentication unavailable");
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal,
        });
        if (!response.ok) throw new Error("Calendar request failed");
        return response.json() as Promise<unknown>;
      }, controller.signal);
      const calendar = liveCalendarMonthSchema.parse(body);
      if (controller.signal.aborted) return;
      setState({
        status: "ready",
        data: calendar.days.map((day) => ({
          ...day,
          events: day.events.filter((event) => event.celebrity.slug === celebrity.slug),
        })),
      });
    } catch {
      if (!controller.signal.aborted) setState({ status: "error" });
    } finally {
      if (refreshController.current === controller) refreshController.current = null;
    }
  // The owner scope carries the session generation, so a new session restarts an otherwise identical public refresh.
  }, [abortCalendarRefresh, authenticated, celebrity.slug, getAccessToken, locale, month, ownerScope, requestAuthenticated, session.ready]);

  useEffect(() => {
    if (!ready) return;
    setState({ status: "loading" });
    setSelectedDate(null);
    void refreshCalendar();
    return abortCalendarRefresh;
  }, [abortCalendarRefresh, ready, refreshCalendar]);

  const handleStartReached = useCallback(() => {
    void refreshCalendar(true);
  }, [refreshCalendar]);

  const handleCheckedDatesChange = useCallback((dates: readonly string[]) => {
    setCheckedDates((current) => current.join(",") === dates.join(",") ? current : dates);
  }, []);

  const liveDays = state.status === "ready" ? state.data : emptyCalendarDays(month);
  const days = combinedCalendarDays({ month, timeZone: "Asia/Seoul", days: liveDays }, schedules.items,
    [{ slug: celebrity.slug, name: celebrity.name, image: celebrity.image.url }],
    new Map(liveDays.flatMap(day => day.events.map(event => [event.slug, celebrity.slug] as const))));
  const checkedDateSet = new Set(checkedDates);
  const firstWeekday = calendarWeekday(days[0]?.date ?? `${month}-01`);
  const previousMonth = adjacentCalendarMonth(month, -1);
  const nextMonth = adjacentCalendarMonth(month, 1);
  const upcomingEvents = days
    .flatMap((day) => day.events)
    .filter((event) => event.effectiveStatus === "live" || (event.effectiveStatus === "scheduled" && currentKstDate(new Date(event.startsAt)) >= today))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .slice(0, 3);

  const selectedDay = days.find((day) => day.date === selectedDate && day.events.length > 0);
  const displayedEvents = selectedDay
    ? [...selectedDay.events].sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    : upcomingEvents;
  const hasDisplayedReservation = displayedEvents.some((event) => event.reservationState === "reserved");
  const calendarId = useId();
  const calendarListId = `${calendarId}-events`;

  return (
    <section className={`${styles.heroCalendar} ${embedded ? styles.embedded : ""}`} aria-labelledby={embedded ? undefined : `${calendarId}-title`} aria-label={embedded ? `${celebrity.name} ${participation.schedules}` : undefined} aria-busy={state.status === "loading"}>
      {!embedded&&<div className={styles.calendarHeading}>
        <h2 id={`${calendarId}-title`}><FanMotionIcon name="calendar" size={18} />{celebrity.name} {participation.schedules}</h2>
      </div>}
      <CalendarMonthHeader month={month} label={miniCalendarMonthLabel(month, locale)} density="compact"
        previous={{ onClick: () => setMonth(previousMonth), label: `${t.previousMonth}: ${miniCalendarMonthLabel(previousMonth, locale)}` }}
        next={{ onClick: () => setMonth(nextMonth), label: `${t.nextMonth}: ${miniCalendarMonthLabel(nextMonth, locale)}` }}
      />
      <div className={styles.calendarWeekdays} aria-hidden="true">
        {t.weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className={styles.calendarDays}>
        {days.map((day, index) => {
          const dayNumber = Number(day.date.slice(-2));
          const firstEvent = day.events[0];
          const checkedIn = checkedDateSet.has(day.date);
          const style = index === 0 ? { gridColumnStart: firstWeekday + 1 } : undefined;
          if (firstEvent) {
            const eventLabel = locale === "ko" ? `${dayNumber}일, ${participation.schedules} ${day.events.length}${checkedIn ? ", 출석 완료" : ""}` : `${dayNumber}, ${participation.schedules} ${day.events.length}`;
            return (
              <MiniCalendarEventDay
                date={day.date}
                today={today}
                count={day.events.length}
                upcoming={day.events.some(event => event.effectiveStatus === "scheduled" || event.effectiveStatus === "live")}
                checkedIn={checkedIn}
                pressed={selectedDay?.date === day.date}
                controls={calendarListId}
                label={eventLabel}
                style={style}
                onClick={() => setSelectedDate(selectedDay?.date === day.date ? null : day.date)}
                key={day.date}
              />
            );
          }
          return (
            <span className={styles.calendarDay} data-today={day.date === today ? "true" : undefined} data-checked-in={checkedIn ? "true" : undefined} key={day.date} style={style} aria-label={checkedIn ? (locale === "ko" ? `${dayNumber}일, 출석 완료` : translate(locale, localizedMessages.mdfeb64d2c67d, "{0}, checked in", [dayNumber])) : undefined}>
              <CalendarDayNumber date={day.date} today={today} />
              {checkedIn ? <i className={dailyStyles.checkinMark} aria-hidden="true">✓</i> : null}
            </span>
          );
        })}
      </div>
      {schedules.status === "error" && <ParticipationState locale={locale} status="error" retry={schedules.retry} />}
      {!embedded&&<DailyCheckin creator={celebrity.slug} locale={locale} month={month} onCheckedDatesChange={handleCheckedDatesChange} />}
      {state.status === "error" ? <div className={styles.calendarMessage} role="alert">
        <p>{t.calendarError}</p>
        <FanAction onClick={() => { setState({status:"loading"}); void refreshCalendar(); }}>{participation.retry}</FanAction>
      </div> : null}
      {state.status === "loading" ? <FanSkeletonStatus locale={locale} label={t.calendarLoading} /> : null}
      <div className={styles.calendarUpcoming} id={calendarListId}>
        <div className={styles.calendarListHeading}>
          <h3 aria-live="polite">{selectedDay ? new Intl.DateTimeFormat(locale, { calendar: "gregory", timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${selectedDay.date}T00:00:00+09:00`)) : t.calendarUpcoming}</h3>
          {selectedDay ? <button type="button" onClick={() => setSelectedDate(null)}>{locale === "ko" ? "전체 보기" : translate(locale, localizedMessages.m150c0d4b6414, "Show all")}</button> : null}
        </div>
        {displayedEvents.length > 0 ? <ol>{displayedEvents.map((event) => (
          <li key={event.id} data-status={event.effectiveStatus}>
            <Link href={`${event.schedule?.detailHref ?? `/live/${event.slug}`}?locale=${locale}` as Route}>
              <time dateTime={event.startsAt}>{formatMiniCalendarDate(event.startsAt, locale)}</time>
              <strong><TranslatedText text={event.title} locale={locale} controls={false} />{event.reservationState === "reserved" ? <LiveReservationMark locale={locale} className={styles.calendarReservation} /> : null}</strong>
              {event.schedule ? <span>{event.schedule.status === "cancelled" ? participation.cancelled : participation[event.schedule.kind]}</span> : <LiveTimeIndicator event={event} locale={locale} active onStartReached={handleStartReached} variant="text" className={styles.calendarTimeIndicator} />}
            </Link>
          </li>
        ))}</ol> : state.status === "ready" ? <p>{participation.empty}</p> : state.status === "loading" ? <div className={styles.calendarSkeleton} aria-hidden="true"><FanSkeleton height={52} width="100%" shape="block" /><FanSkeleton height={52} width="100%" shape="block" /></div> : null}
      </div>
      {!embedded&&<div className={styles.calendarFooter}>
        <Link href={`/c/${celebrity.slug}/schedule-suggestions?locale=${locale}` as Route}>{participation.suggest}</Link>
        {hasDisplayedReservation ? <LiveReservationLegend locale={locale} className={styles.calendarLegend} /> : null}
        <Link href={`/live/calendar?month=${month}&locale=${locale}&celebrity=${celebrity.slug}` as Route}>{t.calendarOpen}<ArrowRight /></Link>
      </div>}
    </section>
  );
}
