export const LOTTERY_ASSETS = ['mix.mp4', 'draw.mp4', 'mix.png', 'draw.png', 'result-ball.png', 'rolling.wav', 'tada.wav', 'ball.wav'].map(name => `lottery/${name}`);

export function initialLottery(saved = {}) {
  return {
    mode: saved.mode === 'onsite' ? 'onsite' : 'live',
    index: Number.isInteger(saved.index) && saved.index >= 0 && saved.index < 100 ? saved.index : 0,
    phase: saved.phase === 'confirmed' ? 'confirmed' : 'prize',
    sequenceKey: typeof saved.sequenceKey === 'string' && saved.sequenceKey.length < 200 ? saved.sequenceKey : '',
    revealedCount: Number.isInteger(saved.revealedCount) && saved.revealedCount >= 0 && saved.revealedCount < 1000 ? saved.revealedCount : 0,
    audio: saved.audio !== false,
  };
}

export function lotteryView(state, onsitePrizes) {
  const lottery = state.lottery ?? initialLottery();
  const onsite = lottery.mode === 'onsite';
  const prizes = onsite ? onsitePrizes.map(prize => ({ ...prize, winnerQuantity: prize.quantity, creatorName: 'KYAA WAVE 현장' })) : state.projection?.draw?.prizes ?? [];
  const prize = prizes[lottery.index];
  const result = onsite ? state.projection?.onsite?.results.find(item => item.prizeKey === prize?.key) : state.projection?.draw?.results[lottery.index];
  const drawId = onsite ? state.projection?.onsite?.drawId : state.projection?.draw?.executedAt;
  const sequenceKey = `${lottery.mode}:${drawId ?? 'pending'}:${prize?.key ?? lottery.index}`;
  const same = lottery.sequenceKey === sequenceKey;
  return { prizes, prize, result, sequenceKey, phase: same ? lottery.phase : 'prize', revealedCount: same ? Math.min(lottery.revealedCount, result?.winners.length ?? 0) : 0 };
}

export function reduceLottery(state, command, onsitePrizes) {
  if (Object.keys(command).some(key => !['type', 'id', 'revision', 'action', 'operation', 'mode', 'index', 'count', 'sequenceKey', 'audio'].includes(key))) throw Error('잘못된 추첨 화면 명령입니다.');
  const lottery = state.lottery ??= initialLottery();
  if (command.operation === 'select') {
    if (!['live', 'onsite'].includes(command.mode) || !Number.isInteger(command.index) || command.index < 0) throw Error('선물을 선택해 주세요.');
    const candidate = { ...state, lottery: { ...lottery, mode: command.mode, index: command.index } };
    const view = lotteryView(candidate, onsitePrizes);
    if (!view.prize) throw Error('선물 정보를 확인해 주세요.');
    Object.assign(lottery, { mode: command.mode, index: command.index, phase: 'prize', sequenceKey: view.sequenceKey, revealedCount: 0 });
    state.scene = 'draw';
    return;
  }
  if (command.operation === 'audio') {
    if (typeof command.audio !== 'boolean') throw Error('잘못된 음향 설정입니다.');
    lottery.audio = command.audio; return;
  }
  const view = lotteryView(state, onsitePrizes);
  if (!view.prize) throw Error('선물 정보를 확인해 주세요.');
  if (command.operation === 'roll') {
    Object.assign(lottery, { phase: 'rolling', sequenceKey: view.sequenceKey, revealedCount: 0 });
    state.scene = 'draw';
  } else if (command.operation === 'reveal') {
    if (!view.result || !state.outputConnected) throw Error('확정 결과와 출력 연결을 먼저 확인해 주세요.');
    Object.assign(lottery, { phase: 'confirmed', sequenceKey: view.sequenceKey, revealedCount: 0 });
    state.scene = 'results';
  } else if (command.operation === 'cursor') {
    if (command.sequenceKey !== view.sequenceKey || lottery.sequenceKey !== view.sequenceKey || lottery.phase !== 'confirmed' || !view.result || !Number.isInteger(command.count) || command.count < lottery.revealedCount || command.count > view.result.winners.length) throw Error('공개 위치를 확인할 수 없습니다.');
    lottery.revealedCount = command.count;
  } else throw Error('지원하지 않는 추첨 화면 명령입니다.');
}
