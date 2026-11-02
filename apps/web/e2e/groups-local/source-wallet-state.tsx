import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { FanAction } from '@/components/fan-ui/fan-action';
import './source-wallet-state.css';

export type SourceWalletStateProps = { nodeId: 'fMkHm' | 'Vgw4h'; onClose: () => void };
/** Pencil result panels for the local harness; no ad, exchange, or balance operation runs here. */
export function SourceWalletState({ nodeId, onClose }: SourceWalletStateProps) {
 const ref = useRef<HTMLDialogElement>(null), completed = nodeId === 'fMkHm';
 useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
 return <dialog ref={ref} className="sourceWalletState" data-source-node={nodeId} aria-labelledby={`${nodeId}-title`} aria-describedby={`${nodeId}-description`} onCancel={event => { event.preventDefault(); onClose(); }}>
  <div className="sourceWalletStateContent">
   {completed && <span className="sourceWalletStateFeedback" aria-hidden="true"><Check size={24}/></span>}
   <h2 id={`${nodeId}-title`}>{completed ? '광고 교환을 완료했어요' : '교환이 취소되었어요'}</h2>
   <p id={`${nodeId}-description`}>{completed ? '교환 결과는 적립·사용 내역에서 확인할 수 있어요.' : '광고 시청이 완료되지 않아 교환되지 않았어요.'}</p>
   <div className="sourceWalletStateActions"><FanAction className="sourceWalletAction" variant="primary" onClick={onClose}>{completed ? '내역 보기' : '다시 시도'}</FanAction></div>
  </div>
 </dialog>;
}
