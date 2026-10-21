import React, { useState } from 'react';
import './operator-controls.css';
const missionLabels = { checkin: '체크인', 'event-photo': '오늘의 한 컷', 'fanpage-like': '팬페이지 좋아요', introduction: '자기소개', friendship: '친구 추가', 'dm-greeting': 'DM 인사', 'live-cheer': 'LIVE 응원', 'insight-review': '나영석 PD님 감사평', 'quiz-correct': '퀴즈 정답', 'website-cheer': '홈 응원', bingo: '빙고' };
const stampLabels = { waiting_wallet: '지갑 연결 대기', preparing: '발급 준비', queued: '발급 대기', processing: '발급 중', retryable: '재처리 대기', permanent_failure: '발급 확인 필요', minted: '발급 완료' };
export function OperatorControls({ session, hideDraw = false }) {
  const [search, setSearch] = useState('');
  if (session.role !== 'controller') return null;
  const operator = session.state?.operator;
  const journal = session.state?.operatorJournal ?? [];
  const unresolved = journal.find(item => ['pending', 'uncertain'].includes(item.status));
  const locked = session.connection !== 'connected' || !session.state?.sourceConnected || !operator?.ready || !!unresolved;
  const people = operator?.participants.filter(person => person.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  const onsite = operator?.onsite;
  const last = journal.at(-1);
  return <section className="operator-controls" aria-labelledby="operator-heading">
    <div className="operator-heading"><h2 id="operator-heading">참가자 · 추첨 운영</h2><button disabled={locked} onClick={() => session.operatorCommand('operator-refresh')}>상태 새로고침</button></div>
    {!operator?.ready && <p role="status">Mac에서 운영자 계정으로 로그인한 소스를 연결해 주세요.</p>}
    {unresolved && <p role="status">{unresolved.status === 'pending' ? '처리 결과를 기다리고 있습니다.' : '결과가 확인되지 않아 추가 실행을 잠갔습니다.'}{unresolved.status === 'uncertain' && <><button disabled={!operator?.ready} onClick={() => session.reconcileOperator(unresolved.command.commandId)}>결과 확인</button><button disabled={!operator?.ready} onClick={() => session.retryOperator(unresolved.command.commandId)}>같은 요청 다시 확인·재시도</button></>}</p>}
    {!unresolved && last && <p role="status">{last.status === 'confirmed' ? '적용 결과를 확인했습니다.' : '적용하지 못했습니다. 운영자 권한과 최신 상태를 확인해 주세요.'}</p>}
    {!hideDraw && <div className="operator-draw-actions"><button disabled={locked || !!session.state?.projection?.draw?.executedAt} onClick={() => session.operatorCommand('live-draw')}>LIVE 페어 추첨</button><button disabled={locked || !!onsite?.drawId || !onsite?.entryCount} onClick={() => session.operatorCommand('onsite-execute')}>현장 경품 추첨</button><button disabled={locked || !onsite?.drawId || onsite.revealedThrough >= 10} onClick={() => session.operatorCommand('onsite-reveal', { drawId: onsite.drawId, prizeIndex: onsite.revealedThrough + 1 })}>{onsite?.revealedThrough < 10 ? `${onsite.revealedThrough + 1}번 경품 공개` : '경품 공개 완료'}</button></div>}
    <label className="operator-search">참가자 이름 검색<input type="search" value={search} onChange={event => setSearch(event.target.value)} autoComplete="off" /></label>
    <p>{people.length}명</p>
    <ul className="operator-participants">{people.map(person => <li key={person.id}><div><strong>{person.name}</strong><span>퀴즈 {person.quizCorrectAt ? '완료' : '미완료'} · 빙고 {person.bingoCompletedAt ? '완료' : '미완료'}</span>{person.stamps.map(stamp => <span key={stamp.key}>{missionLabels[stamp.key]} · {stampLabels[stamp.status]}</span>)}</div><div className="operator-stamp-actions"><button disabled={locked || !!person.quizCorrectAt} onClick={() => session.operatorCommand('quiz-stamp', { participantId: person.id })}>퀴즈 스탬프</button><button disabled={locked || !!person.bingoCompletedAt} onClick={() => session.operatorCommand('bingo-stamp', { participantId: person.id })}>빙고 스탬프</button></div></li>)}</ul>
  </section>;
}
