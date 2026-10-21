import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WavePresentationPanel } from '@/features/wave-stage/ui/wave-presentation-panel';
import { useStageSession } from './session';
import { assetUrl, readMediaReport, previewPoint } from './protocol';
import { ShowEditor } from './show-editor';
import { OperatorControls } from './operator-controls';
import { LotteryControls } from './lottery-controls';
import { LotteryProjection } from './lottery-projection';
import { lotteryView } from './lottery-state';
import { WAVE_PRIZES } from '@/features/fanpage/domain/wave-draw';
import './style.css';
const scenes = [['dashboard', '팬 참여'], ['records', '온체인 기록'], ['explorer', '탐색기'], ['draw', '추첨 현황'], ['results', '당첨 결과']];
const labels = { slide: '슬라이드', html: '프레젠테이션', video: '영상', live: 'LIVE', hold: '대기' };
function App() {
  const session = useStageSession();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (new URLSearchParams(location.search).get('surface') === 'audience') return <Audience {...session} now={now} />;
  if (!session.state || !session.manifest) return <main className="welcome"><div className="wordmark">KYAA <span>WAVE</span></div><p className="eyebrow">STAGE CONSOLE</p><h1>{session.connection === 'pairing' ? 'Mac과 연결해 주세요' : '공연 화면에 연결하는 중'}</h1><p>Mac의 설정에서 컨트롤러 주소를 열어 이 기기를 연결하세요.<br/>iPad와 Mac은 같은 네트워크를 사용해야 합니다.</p>{session.error && <p role="alert">{session.error}</p>}<Setup /></main>;
  return <Controller {...session} now={now} />;
}
function Controller(session) {
  const { state, manifest, connection, frame, error, pending, command, now } = session;
  const [fontSize, setFontSize] = useState(22), [tool, setTool] = useState('none'), [showSetup, setShowSetup] = useState(false), [editing, setEditing] = useState(false);
  const index = manifest.cues.findIndex(c => c.id === state.cueId), cue = manifest.cues[index], next = manifest.cues[index + 1];
  const ready = connection === 'connected', stale = !state.sourceUpdatedAt || now - state.sourceUpdatedAt > 90000;
  const previewRef = useRef(null), drag = useRef(null);
  useEffect(() => { if (ready) command('pointer', { x: 0, y: 0, visible: false }); }, [connection]);
  useEffect(() => { const item = document.querySelector(`[data-cue="${CSS.escape(state.cueId)}"]`); const timeline = item?.parentElement; if (timeline) timeline.scrollTo({ left: item.offsetLeft - timeline.offsetLeft - (timeline.clientWidth - item.clientWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }, [state.cueId]);
  useEffect(() => {
    const handler = e => { if (editing || e.target.closest('input,textarea,select,button') || e.altKey || e.metaKey || e.ctrlKey) return; if (e.key === 'ArrowRight') { e.preventDefault(); command('next'); } if (e.key === 'ArrowLeft') { e.preventDefault(); command('prev'); } if (e.key === 'Escape') { setTool('none'); command('pointer', { x: 0, y: 0, visible: false }); } };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });
  function point(e) { const box = previewRef.current.getBoundingClientRect(), image = previewRef.current.querySelector('img'); return previewPoint(e.clientX, e.clientY, box, image?.naturalWidth, image?.naturalHeight); }
  function finishPointer(e, cancelled = false) {
    const start = drag.current; drag.current = null;
    if (tool === 'laser') command('pointer', { ...point(e), visible: false });
    if (tool === 'explorer' && start && !cancelled && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 12) command('explorer', { operation: 'click', ...point(e) });
  }
  return <main className="console">
    <header className="topbar"><div><div className="wordmark">KYAA <span>WAVE</span></div><p className="eyebrow">STAGE CONSOLE</p></div><div className="connection-group"><span className={`status ${ready ? 'online' : ''}`}>{ready ? '컨트롤러 연결됨' : '연결 복구 중'}</span><span className={`status ${state.outputConnected ? 'online' : ''}`}>{state.outputConnected ? '출력 연결됨' : '출력 연결 대기'}</span><button onClick={() => setShowSetup(!showSetup)} aria-expanded={showSetup}>설정</button></div></header>
    {showSetup && <Setup />}
    {editing && <ShowEditor key={cue.id} cue={cue} onClose={() => setEditing(false)} onSaved={() => setEditing(false)}/>}
    {window.stageNative?.readContent && <div className="tool-row"><button onClick={() => setEditing(true)}>이 화면 문구·대본 편집</button></div>}
    <div className="notice" role="status"><span>{state.sourceConnected ? stale ? '데이터 연결됨 · 마지막 확인값 표시 중' : '데이터 연결됨' : '데이터 소스 연결 안 됨'}{state.sourceUpdatedAt ? ` · ${new Date(state.sourceUpdatedAt).toLocaleTimeString('ko-KR')} 확인` : ''}</span><span>{pending ? '적용 확인 중…' : `${state.connections}개 컨트롤러`} · 리비전 {state.revision}</span></div>
    {(error || state.error) && <p className="error" role="alert">{error || state.error}</p>}
    <div className="workspace"><section className="output-panel" aria-label="공연 출력 제어"><div className="panel-heading"><h1>지금 송출 중</h1><span>{String(index + 1).padStart(2, '0')} / {manifest.cues.length}</span></div>
      <div className={`preview ${tool !== 'none' ? 'interactive' : ''}`} ref={previewRef} aria-label={tool === 'laser' ? '터치하여 레이저 포인터 표시' : tool === 'explorer' ? '탐색기 터치 및 스크롤' : '실제 출력 미리보기'} onPointerDown={e => { if (tool === 'none' || !ready) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, lastY: e.clientY }; if (tool === 'laser') command('pointer', { ...point(e), visible: true }); }} onPointerMove={e => { if (!drag.current) return; if (tool === 'laser') command('pointer', { ...point(e), visible: true }); if (tool === 'explorer') { const deltaY = drag.current.lastY - e.clientY; drag.current.lastY = e.clientY; if (Math.abs(deltaY) > 1) command('explorer', { operation: 'scroll', deltaY }); } }} onPointerUp={e => finishPointer(e)} onPointerCancel={e => finishPointer(e, true)}>
        {frame ? <img src={frame.data} alt="Mac에서 송출 중인 실제 화면" draggable="false"/> : <div className="preview-empty"><strong>{state.outputConnected ? '미리보기 수신 대기' : '출력 화면 연결 대기'}</strong><span>Mac의 디스플레이 설정을 확인하세요</span></div>}
        {frame && now - frame.at > 5000 && <span className="frame-stale">미리보기 갱신 대기</span>}
      </div>
      <div className="cue-heading"><div><p className="eyebrow">{cue?.section} {cue?.time && `· ${cue.time}`}</p><h2>{cue?.label || '큐를 선택하세요'}</h2></div><span className="tag">{labels[cue?.type]}</span></div>
      <div className="advance"><button disabled={!ready || pending || index <= 0} onClick={() => command('prev')} aria-label="이전 큐로 이동">← 이전</button><button className="primary" disabled={!ready || pending || !next} onClick={() => command('next')}>다음 큐로 →<small>{next?.label || '마지막 큐입니다'}</small></button></div>
      <div className="tool-row" aria-label="미리보기 도구">{[['none', '보기'], ['laser', '레이저'], ['explorer', '탐색기 터치']].map(([value, label]) => <button key={value} aria-pressed={tool === value} disabled={!ready || (value === 'explorer' && state.scene !== 'explorer')} onClick={() => { command('pointer', { x: 0, y: 0, visible: false }); setTool(value); }}>{label}</button>)}{state.scene === 'explorer' && <><button disabled={!ready || pending} onClick={() => command('explorer', { operation: 'back' })}>뒤로</button><button disabled={!ready || pending} onClick={() => command('explorer', { operation: 'return' })}>기록으로 복귀</button></>}</div>
      {(cue?.type === 'video' || cue?.type === 'html') && <div className="tool-row" aria-label="미디어 제어"><button disabled={!ready || pending || !state.outputConnected} onClick={() => command('media', { operation: state.media.playing ? 'pause' : 'play' })}>{state.media.playing ? '일시 정지' : '재생'}</button><button disabled={!ready || pending || !state.outputConnected} onClick={() => command('media', { operation: 'restart' })}>처음부터</button><span>{Math.floor(state.media.position || 0)}초</span></div>}
    </section><aside className="script-panel"><div className="panel-heading"><h2>진행 대본</h2><div className="font-controls"><button aria-label="대본 글자 작게" disabled={fontSize <= 16} onClick={() => setFontSize(Math.max(16, fontSize - 2))}>가−</button><button aria-label="대본 글자 크게" disabled={fontSize >= 36} onClick={() => setFontSize(Math.min(36, fontSize + 2))}>가+</button></div></div><div className="script" style={{ fontSize }}>{cue?.script?.length ? cue.script.map((line, i) => <p key={i}>{line}</p>) : <p className="muted">등록된 대본이 없습니다.</p>}</div><div className="up-next"><p className="eyebrow">UP NEXT</p><strong>{next?.label || '마지막 큐'}</strong>{next?.script?.[0] && <p>{next.script[0]}</p>}</div></aside></div>
    <section className="live-controls" aria-label="라이브 화면 설정"><div className="panel-heading"><h2>LIVE 화면</h2><button disabled={!ready || pending} onClick={() => command('refresh')}>데이터 새로고침 ↻</button></div><div className="segmented scenes">{scenes.map(([value, label]) => <button key={value} aria-pressed={state.scene === value} disabled={!ready || pending} onClick={() => command('scene', { scene: value })}>{label}</button>)}</div><div className="setting-groups"><Setting label="집계 기간" values={[["all", "누적 활동"], ["event-day", "행사 당일"]]} value={state.scope} disabled={!ready || pending} onChange={scope => command('scope', { scope })}/><Setting label="출력 배치" values={[["triptych", "3분할"], ["center", "가운데 전체"], ["performance", "공연 전체"]]} value={state.layout} disabled={!ready || pending} onChange={layout => command('layout', { layout })}/><Setting label="LIVE 음성 · 한 채널만" values={[["none", "음소거"], ["changha", "창하"]]} value={state.audio} disabled={!ready || pending} onChange={audio => command('audio', { audio })}/></div><p className="muted small">창하 방송 음량은 25%이며 We;Na는 음소거합니다. 현장 믹서에서 발표자 마이크를 먼저 맞춰 주세요.</p></section>
    <LotteryControls session={session}/>
    <details className="operator-details"><summary>참가자 도장 발급·처리 결과 확인</summary><OperatorControls session={session} hideDraw/></details>
    <section className="timeline-section" aria-label="전체 큐"><div className="panel-heading"><h2>전체 큐</h2><span>{manifest.title}</span></div><div className="timeline">{manifest.cues.map((item, i) => <button data-cue={item.id} key={item.id} className="cue-thumb" aria-pressed={item.id === state.cueId} disabled={!ready || pending} onClick={() => command('goto', { cueId: item.id })}><div className="thumb-image">{(item.thumbnail || item.type === 'slide' && item.asset) ? <img src={assetUrl(item.thumbnail || item.asset)} alt="" loading="lazy"/> : <span>{labels[item.type]}</span>}<b>{String(i + 1).padStart(2, '0')}</b></div><span>{item.label}</span><small>{item.section}</small></button>)}</div></section>
  </main>;
}
function Setting({ label, values, value, disabled, onChange }) { return <fieldset><legend>{label}</legend><div className="segmented">{values.map(([key, title]) => <button key={key} disabled={disabled} aria-pressed={key === value} onClick={() => onChange(key)}>{title}</button>)}</div></fieldset>; }
function Setup() {
  const [setup, setSetup] = useState(null), [error, setError] = useState(''), [origin, setOrigin] = useState('');
  useEffect(() => { let alive = true; const update = value => { if (alive) setSetup(value); }; (window.stageNative?.getSetup ? window.stageNative.getSetup() : fetch('/api/setup').then(r => r.ok ? r.json() : null)).then(update).catch(e => setError(e.message)); const unsubscribe = window.stageNative?.onSetup?.(update); return () => { alive = false; if (typeof unsubscribe === 'function') unsubscribe(); }; }, []);
  async function invoke(method, value) { try { setError(''); await window.stageNative?.[method]?.(value); const fresh = await window.stageNative?.getSetup?.(); if (fresh) setSetup(fresh); } catch (e) { setError(e.message); } }
  return <section className="setup"><div className="panel-heading"><h2>연결 설정</h2><span>같은 네트워크 · Mac 출력</span></div>{setup?.controllerUrls?.length > 0 && <div><p>iPad Safari에서 아래 페어링 주소를 여세요. 연결 주소는 다른 사람에게 공유하지 마세요.</p>{setup.controllerUrls.map(url => <p className="pair-url" key={url}>{url}</p>)}</div>}{setup?.qrDataUrls?.length > 0 && <div className="pairing-qr">{setup.qrDataUrls.map(item => <figure key={item.url}><img src={item.data} alt="iPad 연결용 페어링 QR 코드" width="160" height="160"/><figcaption>{item.url}</figcaption></figure>)}</div>}{setup?.certificateFingerprint && <p className="certificate-fingerprint">설치 전 iPad 인증서 세부 정보의 SHA-256 지문이 이 Mac과 같은지 확인하세요.<code>{setup.certificateFingerprint}</code></p>}{setup?.certificateUrls?.length > 0 && <div className="certificate-links"><p>iPad에서 공개 인증서를 다운로드해 설치하세요. 개인 키는 포함되지 않습니다.</p>{setup.certificateUrls.map((item, i) => { const url = typeof item === 'string' ? item : item.url; return <a key={url} href={url}>인증서 다운로드{setup.certificateUrls.length > 1 ? ` ${i + 1}` : ''} ↗</a>; })}</div>}{window.stageNative && <><div className="setup-actions"><label>출력 디스플레이<select value={setup?.selectedDisplayId ?? ''} onChange={e => invoke('selectDisplay', e.target.value)}><option value="" disabled>디스플레이 선택</option>{setup?.displays?.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label><button onClick={() => invoke('openCertificate')}>인증서 열기</button><button onClick={() => invoke('openSource')}>데이터 원본 브라우저 열기</button><button onClick={() => invoke('importShow')}>공연 파일 가져오기</button></div><form className="origin-form" onSubmit={e => { e.preventDefault(); invoke('setSourceOrigin', origin); }}><label htmlFor="source-origin">데이터 원본 주소</label><input id="source-origin" type="url" value={origin} onChange={e => setOrigin(e.target.value)} placeholder="http://localhost:3000" required/><button type="submit">주소 적용</button></form><p className="muted small">인증서를 iPad에 설치한 뒤 설정 → 일반 → 정보 → 인증서 신뢰 설정에서 신뢰를 켜세요. 원본 브라우저에서는 로그인 후 연결을 승인하세요.</p></>}{!window.stageNative && <p className="muted">디스플레이·인증서·데이터 원본 설정은 Mac에서 변경할 수 있습니다.</p>}{error && <p role="alert" className="error">{error}</p>}</section>;
}
function Audience({ state, manifest, connection, mediaCommand, pointer, now }) {
  const cue = manifest?.cues.find(c => c.id === state?.cueId), video = useRef(null), iframe = useRef(null);
  const desiredMedia = useRef(null);
  const [htmlReadyCue, setHtmlReadyCue] = useState(null);
  const report = values => window.stageNative?.reportMedia?.({ cueId: cue?.id, ...values });
  function applyText() { iframe.current?.contentWindow?.postMessage({ type: 'kyaa-stage', action: 'text', index: cue?.slideIndex, slideText: cue?.slideText ?? {} }, location.origin); }
  useEffect(() => { applyText(); }, [cue?.slideText]);
  function applyMedia(operation, position) {
    const element = video.current;
    if (element) {
      if (operation === 'restart') element.currentTime = 0;
      else if (Number.isFinite(position) && Math.abs(element.currentTime - position) > 1.5) element.currentTime = position;
      if (operation === 'play' || operation === 'restart') element.play().catch(() => report({ playing: false, position: element.currentTime })); else element.pause();
    }
    iframe.current?.contentWindow?.postMessage({ type: 'kyaa-stage', action: 'media', operation, position }, location.origin);
  }
  useEffect(() => {
    setHtmlReadyCue(null);
    if (!cue || !state || connection !== 'connected') return;
    desiredMedia.current = { operation: state.media.playing ? 'play' : 'pause', position: state.media.position };
    iframe.current?.contentWindow?.postMessage({ type: 'kyaa-stage', action: 'slide', index: cue.slideIndex ?? 0 }, location.origin);
    applyMedia(desiredMedia.current.operation, desiredMedia.current.position);
  }, [cue?.id, connection]);
  useEffect(() => {
    if (!mediaCommand || mediaCommand.cueId !== cue?.id) return;
    desiredMedia.current = mediaCommand;
    applyMedia(mediaCommand.operation, mediaCommand.operation === 'restart' ? 0 : mediaCommand.position);
  }, [mediaCommand]);
  useEffect(() => {
    const listener = e => {
      if (e.origin !== location.origin || e.source !== iframe.current?.contentWindow || e.data?.type !== 'kyaa-stage-media') return;
      if (e.data.event === 'ready' && e.data.index === cue?.slideIndex) { applyText(); applyMedia(desiredMedia.current?.operation || 'pause', desiredMedia.current?.position); setHtmlReadyCue(cue.id); }
      const value = readMediaReport(e, { origin: location.origin, source: iframe.current?.contentWindow, cueId: cue?.id, slideIndex: cue?.slideIndex });
      if (value) window.stageNative?.reportMedia?.(value);
    };
    window.addEventListener('message', listener); return () => window.removeEventListener('message', listener);
  }, [cue?.id, cue?.slideText]);
  const initializeHtml = () => { iframe.current?.contentWindow?.postMessage({ type: 'kyaa-stage', action: 'slide', index: cue.slideIndex ?? 0 }, location.origin); applyMedia(desiredMedia.current?.operation || 'pause', desiredMedia.current?.position); };
  const laser = pointer?.visible ? <div className="laser-pointer" style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }} /> : null;
  if (!state || !cue) return <main className="audience audience-wait"><div className="wordmark">KYAA WAVE</div><h1>공연 준비 중</h1><p>{connection === 'pairing' ? 'Mac에서 출력 연결을 확인하세요' : '공연 상태를 연결하고 있습니다'}</p></main>;
  if (cue.type === 'slide') return <main className="audience">{laser}<img className="audience-slide" src={assetUrl(cue.asset)} alt={cue.label}/></main>;
  if (cue.type === 'video') return <main className="audience"><video key={cue.id} ref={video} src={assetUrl(cue.asset)} playsInline onTimeUpdate={e => report({ playing: !e.currentTarget.paused, position: e.currentTarget.currentTime })} onPlay={e => report({ playing: true, position: e.currentTarget.currentTime })} onPause={e => report({ playing: false, position: e.currentTarget.currentTime })} onEnded={e => report({ playing: false, position: e.currentTarget.currentTime, ended: true })}/></main>;
  if (cue.type === 'html') return <main className="audience">{laser}<iframe key={cue.asset} style={{ visibility: htmlReadyCue === cue.id ? 'visible' : 'hidden' }} ref={iframe} title={cue.label} src={assetUrl(cue.asset)} sandbox="allow-scripts allow-same-origin" onLoad={initializeHtml}/></main>;
  if (cue.type === 'hold') return <main className="audience audience-wait"><div className="wordmark">KYAA <span>WAVE</span></div><h1>{cue.label}</h1></main>;
  const projection = state.projection;
  const lottery = lotteryView(state, WAVE_PRIZES);
  const sourceStale = !state.sourceConnected || !state.sourceUpdatedAt || now - state.sourceUpdatedAt > 90000;
  return <main className={`audience audience-live layout-${state.layout} scene-${state.scene}`}>{laser}<div className="external-placeholder left"><strong>CHANGHA</strong><span>LIVE 연결 대기</span></div><div className="projection"><div className="projection-content">{['dashboard', 'records'].includes(state.scene) ? <WavePresentationPanel scene={state.scene} locale="ko" presentation={projection?.presentation} tiktok={projection?.tiktok} scope={state.scope} presentationFailed={sourceStale || projection?.presentationFailed} tiktokFailed={sourceStale || projection?.tiktokFailed}/> : state.scene === 'explorer' ? <div className="audience-wait"><h1>GIWA 탐색기</h1><p>원본 탐색기 연결 대기</p></div> : lottery.prize ? <LotteryProjection sequenceKey={lottery.sequenceKey} phase={lottery.phase} prize={lottery.prize} winners={lottery.result?.winners ?? []} revealedCount={lottery.revealedCount} onRevealCount={(count, sequenceKey) => window.stageNative?.reportLotteryCursor?.({ count, sequenceKey })} audioEnabled={state.lottery.audio && state.outputConnected} rollingSoundUrl={assetUrl('lottery/rolling.wav')} confirmedSoundUrl={assetUrl('lottery/tada.wav')} ballSoundUrl={assetUrl('lottery/ball.wav')}/> : <DrawProjection draw={projection?.draw} results={state.scene === 'results'}/>}</div>{sourceStale && <p className="projection-warning">{state.sourceConnected ? '데이터 갱신 지연 · 마지막 확인값입니다' : '데이터 연결 대기 · 마지막 확인값이 있을 경우 함께 표시합니다'}</p>}</div><div className="external-placeholder right"><strong>We;Na</strong><span>LIVE 연결 대기</span></div></main>;
}
function DrawProjection({ draw, results }) { return <section className="draw-projection"><p className="eyebrow">KYAA WAVE · 2026.10.22</p><h1>{results ? '당첨 결과' : '팬 참여 추첨 현황'}</h1>{!draw ? <p>로그인한 원본 브라우저의 데이터를 기다리고 있습니다.</p> : results ? draw.results.length ? draw.results.map((result, i) => <article key={i}><h2>{result.title}</h2><p>{result.creatorName}</p><div className="winner-list">{result.winners.map((winner, j) => <p key={j}><strong>{winner.displayName}</strong><span>{winner.displayCode}</span></p>)}</div></article>) : <p>아직 공개된 당첨 결과가 없습니다.</p> : <><div className="draw-counts">{draw.creators.map((creator, i) => <article key={i}><h2>{creator.name}</h2><strong>{creator.participantCount.toLocaleString('ko-KR')}</strong><p>참여자</p></article>)}</div>{draw.prizes.map((prize, i) => <p className="prize" key={i}>{prize.title}<span>{prize.creatorName} · {prize.winnerQuantity}명</span></p>)}</>}</section>; }
createRoot(document.getElementById('root')).render(<App/>);
