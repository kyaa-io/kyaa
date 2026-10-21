import React, { useEffect, useState } from 'react';
import { WAVE_PRIZES } from '@/features/fanpage/domain/wave-draw';
import { lotteryView } from './lottery-state';

export function LotteryControls({ session }) {
  const { state, command, operatorCommand, connection, pending } = session;
  const lottery = state.lottery;
  const view = lotteryView(state, WAVE_PRIZES);
  const [waitingFor, setWaitingFor] = useState(null);
  const unresolved = state.operatorJournal?.some(item => ['pending', 'uncertain'].includes(item.status));
  const writeReady = connection === 'connected' && state.sourceConnected && state.operator?.ready && !unresolved;
  const ready = connection === 'connected' && state.outputConnected && !pending;
  const onsite = lottery.mode === 'onsite';
  const drawId = onsite ? state.operator?.onsite?.drawId : state.projection?.draw?.executedAt;
  useEffect(() => {
    if (!waitingFor || waitingFor !== `${lottery.mode}:${lottery.index}`) return;
    if (view.result && ready) { setWaitingFor(null); command('lottery', { operation: 'reveal' }); }
  }, [waitingFor, lottery.mode, lottery.index, view.result, ready]);
  const select = (mode, index) => { setWaitingFor(null); command('lottery', { operation: 'select', mode, index }); };
  const reveal = () => {
    if (view.result) command('lottery', { operation: 'reveal' });
    else if (onsite && drawId && writeReady) {
      setWaitingFor(`${lottery.mode}:${lottery.index}`);
      operatorCommand('onsite-reveal', { drawId, prizeIndex: lottery.index + 1 });
    }
  };
  return <section className="live-controls lottery-controls" aria-labelledby="lottery-controls-heading">
    <div className="panel-heading"><h2 id="lottery-controls-heading">선물 공개 진행</h2><button aria-pressed={lottery.audio} disabled={!ready} onClick={() => command('lottery', { operation: 'audio', audio: !lottery.audio })}>{lottery.audio ? '추첨 소리 켜짐' : '추첨 소리 꺼짐'}</button></div>
    <div className="segmented"><button aria-pressed={!onsite} disabled={!ready || !state.projection?.draw?.prizes.length} onClick={() => select('live', 0)}>LIVE 팬 선물</button><button aria-pressed={onsite} disabled={!ready} onClick={() => select('onsite', 0)}>현장 럭키드로우</button></div>
    {!view.prize ? <p role="status">로그인한 원본 브라우저에서 선물 정보를 연결해 주세요.</p> : <>
      <label>공개할 선물<select value={lottery.index} disabled={!ready} onChange={event => select(lottery.mode, Number(event.target.value))}>{view.prizes.map((prize, index) => <option key={prize.key ?? index} value={index}>{index + 1}. {prize.title} · {prize.winnerQuantity}명</option>)}</select></label>
      <div className="tool-row"><button disabled={!writeReady || !!drawId} onClick={() => operatorCommand(onsite ? 'onsite-execute' : 'live-draw')}>{drawId ? '추첨 확정됨' : '응모 마감·추첨'}</button><button disabled={!ready || !drawId || view.phase === 'rolling'} onClick={() => command('lottery', { operation: 'roll' })}>공 돌리기</button><button className="primary" disabled={!ready || !drawId || view.phase !== 'rolling' || (!view.result && (!onsite || !writeReady || lottery.index !== (state.operator?.onsite?.revealedThrough ?? 0)))} onClick={reveal}>{waitingFor ? '확정 결과 확인 중…' : '당첨자 공개'}</button><button disabled={!ready || lottery.index + 1 >= view.prizes.length} onClick={() => select(lottery.mode, lottery.index + 1)}>다음 선물 →</button></div>
      <p className="muted small">선물을 소개하고 공을 돌린 뒤 당첨자를 공개하세요. 이미 확정된 결과를 다시 보여줄 때는 새로 추첨하지 않습니다.</p>
    </>}
  </section>;
}
