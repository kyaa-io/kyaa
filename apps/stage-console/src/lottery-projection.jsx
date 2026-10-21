import React, { useEffect, useRef, useState } from 'react';
import { createRevealSequence, revealCountAt, WINNER_REVEAL_INTERVAL_MS, WINNER_PAGE_HOLD_MS, winnerPage, revealSounds } from './lottery-sequence.js';
import './lottery-projection.css';

function useProjectionPreferences() {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReducedMotion(query.matches);
    const visibility = () => setVisible(!document.hidden);
    query.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => { query.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return { reducedMotion, visible };
}

// Winners must come from a confirmed public projection; this component never requests a draw.
export function LotteryProjection({ sequenceKey, ...props }) {
  return <LotteryScene key={sequenceKey} sequenceKey={sequenceKey} {...props} />;
}

function LotteryScene({ phase = 'prize', sequenceKey, prize, winners = [], revealedCount = 0, onRevealCount, active = true, audioEnabled = false, rollingSoundUrl, confirmedSoundUrl, ballSoundUrl, assetBase = '/assets/lottery' }) {
  const { reducedMotion, visible } = useProjectionPreferences();
  const playing = active && visible;
  const video = useRef(null);
  const callback = useRef(onRevealCount);
  callback.current = onRevealCount;
  const [count, setCount] = useState(() => createRevealSequence(sequenceKey, revealedCount, winners.length).initialCount);
  const [dispensed, setDispensed] = useState(revealedCount > 0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(false);
  const audibleReveal = useRef(-1);
  const activeSounds = useRef(new Set());
  const confirmed = phase === 'confirmed';
  const showResults = confirmed && (dispensed || reducedMotion || videoFailed);
  const source = `${assetBase}/${confirmed ? 'draw' : 'mix'}`;

  useEffect(() => {
    if (revealedCount > 0) setDispensed(true);
    setCount(current => Math.max(current, createRevealSequence(sequenceKey, revealedCount, winners.length).initialCount));
  }, [sequenceKey, revealedCount, winners.length]);

  useEffect(() => {
    for (const filename of ['mix.png', 'draw.png', 'result-ball.png']) {
      const image = new Image();
      image.src = `${assetBase}/${filename}`;
    }
  }, [assetBase]);

  useEffect(() => {
    const media = video.current;
    if (!media) return;
    if (!playing || reducedMotion) { media.pause(); return; }
    media.play().catch(() => { setVideoFailed(true); if (confirmed) setDispensed(true); });
    return () => media.pause();
  }, [playing, reducedMotion, confirmed, source]);

  useEffect(() => {
    if (!confirmed || dispensed || reducedMotion || !playing) return;
    // The supplied draw clip is five seconds; a stalled decoder must not conceal confirmed results.
    const timeout = setTimeout(() => setDispensed(true), 8_000);
    return () => clearTimeout(timeout);
  }, [confirmed, dispensed, reducedMotion, playing]);

  useEffect(() => {
    if (!showResults || !playing) return;
    const sequence = createRevealSequence(sequenceKey, count, winners.length);
    if (sequence.initialCount >= sequence.total) return;
    const advance = elapsed => {
      const next = revealCountAt(sequence, elapsed, reducedMotion);
      audibleReveal.current = next;
      setCount(next);
      callback.current?.(next, sequenceKey);
    };
    if (reducedMotion) { advance(0); return; }
    const timer = setTimeout(() => advance(WINNER_REVEAL_INTERVAL_MS), WINNER_REVEAL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [showResults, playing, reducedMotion, count, winners.length, sequenceKey]);

  useEffect(() => {
    if (!playing || !audioEnabled || phase !== 'rolling' || !rollingSoundUrl) return;
    const sound = new Audio(rollingSoundUrl);
    sound.loop = true;
    sound.play().catch(() => {});
    return () => { sound.pause(); sound.currentTime = 0; };
  }, [playing, audioEnabled, phase, rollingSoundUrl]);

  const lastSoundCount = useRef(revealedCount);
  useEffect(() => {
    const cues = revealSounds(lastSoundCount.current, count, winners.length, reducedMotion);
    lastSoundCount.current = count;
    if (audibleReveal.current !== count || !showResults || !playing || !audioEnabled) return;
    for (const url of [cues.ball && ballSoundUrl, cues.complete && confirmedSoundUrl].filter(Boolean)) {
      const sound = new Audio(url);
      activeSounds.current.add(sound);
      sound.addEventListener('ended', () => activeSounds.current.delete(sound), { once: true });
      sound.play().catch(() => activeSounds.current.delete(sound));
    }
  }, [count, winners.length, reducedMotion, showResults, playing, audioEnabled, ballSoundUrl, confirmedSoundUrl]);

  useEffect(() => () => {
    for (const sound of activeSounds.current) { sound.pause(); sound.currentTime = 0; }
    activeSounds.current.clear();
  }, [playing, audioEnabled, showResults]);

  const page = winnerPage(count, winners.length, pageOffset);
  const complete = winners.length > 0 && count >= winners.length;
  useEffect(() => { setPageOffset(0); }, [count]);
  useEffect(() => {
    if (!showResults || !complete || !playing || reducedMotion || rotationPaused || page.pageCount < 2) return;
    const timer = setInterval(() => setPageOffset(offset => offset + 1), WINNER_PAGE_HOLD_MS);
    return () => clearInterval(timer);
  }, [showResults, complete, playing, reducedMotion, rotationPaused, page.pageCount]);

  const status = phase === 'prize' ? '오늘의 선물' : phase === 'rolling' ? '당첨 결과 확인 중' : showResults ? '당첨을 축하합니다' : '당첨자 공개';
  return <section className={`lottery-projection lottery-projection--${phase}`} aria-label="KYAA WAVE 럭키드로우">
    <header className="lottery-heading"><p>KYAA WAVE · LUCKY DRAW</p><span>{prize?.creatorName}</span><h2>{prize?.title ?? '럭키드로우'}</h2><p className="lottery-phase" role="status">{status}</p></header>
    {phase === 'prize' ? <div className="lottery-gift"><span aria-hidden="true">✦</span><p>LUCKY GIFT</p><strong>{prize?.winnerQuantity ?? '—'}<small>명</small></strong></div> : showResults ? <ol className="lottery-winners" aria-label={count ? `확정 당첨자 ${page.start + 1}–${page.end}번` : '확정 당첨자'} aria-live={complete ? 'off' : 'polite'} aria-relevant="additions">
      {winners.slice(page.start, page.end).map((winner, localIndex) => { const index = page.start + localIndex; return <li key={`${index}-${winner.displayCode ?? ''}`} className="lottery-winner"><div className="lottery-ball"><img src={`${assetBase}/result-ball.png`} alt="" /><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></div><div className="lottery-winner-name"><strong>{winner.displayName}</strong>{winner.displayCode && <span>{winner.displayCode}</span>}</div></li>; })}
      {!winners.length && <li className="lottery-empty">공개된 당첨자가 없습니다.</li>}
    </ol> : <div className="lottery-machine"><img src={`${source}.png`} alt="" />{playing && !reducedMotion && !videoFailed && <video key={source} ref={video} src={`${source}.mp4`} poster={`${source}.png`} muted playsInline autoPlay preload="auto" loop={!confirmed} onEnded={() => { if (confirmed) setDispensed(true); }} onError={() => { setVideoFailed(true); if (confirmed) setDispensed(true); }} aria-hidden="true" />}</div>}
    <footer className="lottery-footer">{showResults ? <><p>확정 당첨자 {Math.min(count, winners.length)}명{count > 0 && <> · 현재 {page.start + 1}–{page.end}번</>}</p>{page.pageCount > 1 && <nav className="lottery-pagination" aria-label="당첨자 페이지"><button type="button" disabled={!complete} onClick={() => { setRotationPaused(true); setPageOffset(offset => offset - 1); }} aria-label="이전 당첨자 페이지">이전</button><span>{page.page + 1} / {page.pageCount}</span><button type="button" disabled={!complete} onClick={() => { setRotationPaused(true); setPageOffset(offset => offset + 1); }} aria-label="다음 당첨자 페이지">다음</button>{!reducedMotion && complete && <button type="button" aria-pressed={rotationPaused} onClick={() => setRotationPaused(value => !value)}>{rotationPaused ? '자동 넘김 재개' : '자동 넘김 멈춤'}</button>}</nav>}</> : phase === 'prize' ? 'Every Fan Moment Counts.' : 'KYAA WAVE · LUCKY DRAW'}</footer>
  </section>;
}
