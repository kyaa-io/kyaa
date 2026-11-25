import type { MouseEvent } from "react";

export function exitFortune(event: MouseEvent<HTMLAnchorElement>) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const navigation = (window as Window & {
    navigation?: { currentEntry: { index: number }; entries(): { url: string | null }[] };
  }).navigation;
  const previous = navigation?.entries()[navigation.currentEntry.index - 1]?.url;
  event.preventDefault();
  if (previous && new URL(previous).pathname !== window.location.pathname) {
    window.history.back();
  } else {
    window.location.replace(event.currentTarget.href);
  }
}
