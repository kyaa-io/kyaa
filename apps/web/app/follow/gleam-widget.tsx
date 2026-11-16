'use client';
import { useEffect, useRef } from 'react';
import styles from './gleam-widget.module.css';

/** Gleam 공식 설치 코드의 로더(X-GLEAM-1116). CSP는 이 주소와 iframe(gleam.io)을 /follow에서만 연다(security-headers gleamWidgetPaths). */
export const gleamLoaderSrc = 'https://widget.gleamjs.io/e.js';

/**
 * Gleam 대회 위젯. 로더가 a.e-widget을 찾아 iframe으로 바꿔 끼우므로(React 밖의 DOM 교체), React가 그리는 빈 상자 안에 직접 만든다.
 * no-button: 좁은 화면에서도 버튼 대신 위젯 전체를 보인다. 링크는 공통 UTM·클릭 수집에서 뺀다(위젯 주소가 바뀌면 안 된다).
 * 로더가 막히면 링크가 그대로 남아 Gleam 대회 페이지로 간다.
 */
export function GleamWidget({ href, title }: { href: string; title: string }) {
 const host = useRef<HTMLDivElement>(null);
 useEffect(() => {
  const box = host.current;
  if (!box) return;
  const anchor = document.createElement('a');
  anchor.className = 'e-widget no-button generic-loader';
  anchor.href = href;
  anchor.rel = 'nofollow';
  anchor.textContent = title;
  anchor.dataset.outboundTracking = 'off';
  const loader = document.createElement('script');
  loader.src = gleamLoaderSrc;
  loader.async = true;
  box.replaceChildren(anchor, loader);
  return () => box.replaceChildren();
 }, [href, title]);
 return <div ref={host} className={styles.widget} data-block="gleam-widget" />;
}
