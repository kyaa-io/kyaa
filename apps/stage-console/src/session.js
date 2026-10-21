import { useEffect, useRef, useState } from 'react';
export function useStageSession() {
  const [snapshot, setSnapshot] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');
  const [frame, setFrame] = useState(null);
  const [pending, setPending] = useState(false);
  const [mediaCommand, setMediaCommand] = useState(null), [pointer, setPointer] = useState(null);
  const socket = useRef(null), latest = useRef(null), waiting = useRef(new Map());
  useEffect(() => {
    let stopped = false, retry;
    const clearPending = () => { waiting.current.forEach(clearTimeout); waiting.current.clear(); setPending(false); };
    const apply = (value) => { latest.current = value; setSnapshot(value); };
    async function connect() {
      setConnection('connecting'); clearPending(); setFrame(null); setPointer(null); setMediaCommand(null);
      try {
        const token = new URLSearchParams(location.hash.slice(1)).get('pair');
        if (token) {
          history.replaceState(null, '', location.pathname + location.search);
          if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('페어링 주소가 올바르지 않습니다.');
          const paired = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
          if (!paired.ok) throw new Error('페어링에 실패했습니다. Mac에서 새 주소를 확인해 주세요.');
        }
        const response = await fetch('/api/state', { cache: 'no-store' });
        if (response.status === 401 || response.status === 403) { setConnection('pairing'); return; }
        if (!response.ok) throw new Error('공연 상태를 불러올 수 없습니다.');
        const initial = await response.json();
        if (stopped) return;
        apply(initial);
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
        socket.current = ws;
        ws.onmessage = (event) => {
          if (stopped || socket.current !== ws) return;
          let message; try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === 'snapshot') { apply({ role: message.role, state: message.state, manifest: message.manifest }); setConnection('connected'); setError(''); }
          if (message.type === 'state') apply({ ...latest.current, state: message.state });
          if (message.type === 'media-command') setMediaCommand({ ...message, received: performance.now() });
          if (message.type === 'pointer') setPointer(message);
          if (message.type === 'frame' && message.target === 'output') setFrame({ data: message.data, at: Date.now() });
          if (message.type === 'ack') { clearTimeout(waiting.current.get(message.id)); waiting.current.delete(message.id); setPending(waiting.current.size > 0); if (!message.ok) setError(message.error || '명령을 적용하지 못했습니다. 현재 상태를 확인해 주세요.'); }
        };
        ws.onclose = () => { if (stopped || socket.current !== ws) return; socket.current = null; clearPending(); setFrame(null); setPointer(null); setMediaCommand(null); setConnection('disconnected'); retry = setTimeout(connect, 1500); };
        ws.onerror = () => ws.close();
      } catch (e) { if (!stopped) { setError(e.message); setConnection('disconnected'); retry = setTimeout(connect, 3000); } }
    }
    connect();
    return () => { stopped = true; clearTimeout(retry); clearPending(); socket.current?.close(); socket.current = null; };
  }, []);
  function command(action, values = {}) {
    const ws = socket.current, state = latest.current?.state;
    if (!state || connection !== 'connected' || ws?.readyState !== WebSocket.OPEN) return;
    const id = crypto.randomUUID();
    ws.send(JSON.stringify({ type: 'command', id, revision: state.revision, action, ...values }));
    if (action === 'pointer') return;
    const timer = setTimeout(() => { waiting.current.delete(id); setPending(waiting.current.size > 0); setError('응답이 지연되고 있습니다. 현재 화면을 확인해 주세요.'); }, 7000);
    waiting.current.set(id, timer); setPending(true);
  }
  function operatorCommand(operation, values = {}) {
    const ws = socket.current;
    if (connection !== 'connected' || latest.current?.role !== 'controller' || ws?.readyState !== WebSocket.OPEN) return;
    const commandId = crypto.randomUUID(), requestId = crypto.randomUUID();
    ws.send(JSON.stringify({ type: 'operator-command', commandId, requestId, operation, ...values }));
  }
  function reconcileOperator(commandId) {
    const ws = socket.current;
    if (latest.current?.role === 'controller' && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'operator-reconcile', commandId }));
  }
  function retryOperator(commandId) {
    const ws = socket.current;
    if (latest.current?.role === 'controller' && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'operator-retry', commandId }));
  }
  return { ...snapshot, connection, error, frame, pending, command, operatorCommand, reconcileOperator, retryOperator, mediaCommand, pointer };
}
