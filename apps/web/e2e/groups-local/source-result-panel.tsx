import {sourcePanelTitle,sourcePanelText,sourcePanelTextStyle,sourcePanelActionClass,sourcePanelActionText,sourcePanelActionExists,sourcePanelHasActions,sourcePanelField,sourcePanelContainerStyle,SourcePanelExtra} from './source-panel-properties';
import { useEffect, useRef } from 'react';
import { CircleAlert, Clock3, Inbox } from 'lucide-react';
import { FanAction } from '@/components/fan-ui/fan-action';
import './source-result-panel.css';

type Action = { label: string; treatment: 'primary' | 'neutral' | 'progress' | 'pending'; href?: string; retry?: boolean };
type Panel = { title: string; body: string; subtitle?: string; note?: string; feedback?: 'danger' | 'inbox'; clock?: boolean; capsule?: boolean; plain?: boolean; actions: readonly Action[] };
// Current Pencil property exports, projected only inside the loopback review harness.
export const SOURCE_RESULT_PANELS = {"QnIgR":{"title":"잔액을 불러오지 못했어요","body":"내 포인트·하트·응모권을 다시 확인해 주세요.","feedback":"danger","actions":[{"label":"잔액 다시 확인","treatment":"primary","retry":true}]},"QnKkN":{"title":"교환을 완료하지 못했어요","body":"기존 잔액은 그대로예요. 다시 시도해 주세요.","feedback":"danger","actions":[{"label":"교환 내역 확인","treatment":"primary","href":"/my/wallet?locale=ko"},{"label":"다시 시도","treatment":"neutral","retry":true}]},"cPjvM":{"title":"교환을 확인하고 있어요","body":"확인이 끝날 때까지 다시 교환할 수 없어요. 잠시 후 결과를 확인해 주세요.","clock":true,"actions":[{"label":"결과 확인","treatment":"neutral","retry":true}]},"iboGb":{"title":"지급 내역을 확인할 수 없어요","body":"출석 결과와 포인트 지급 내역을 다시 확인해 주세요.","feedback":"inbox","actions":[{"label":"출석·지급 기록 확인","treatment":"primary","href":"/my/wallet?locale=ko"}]},"NcJxO":{"title":"출석을 확인하고 있어요","body":"출석과 포인트 지급 결과를 확인하고 있어요. 잠시만 기다려 주세요.","clock":true,"actions":[]},"es3y5":{"title":"이전 뽑기 결과가 있어요","body":"중단된 뽑기의 결과를 확인할 수 있어요. 결과나 연출을 다시 봐도 응모권은 추가로 차감되지 않아요.","plain":true,"actions":[{"label":"이전 결과 보기","treatment":"primary","retry":true},{"label":"연출 다시 보기","treatment":"neutral","retry":true}]},"We1zf":{"title":"뽑기 결과를 확인할 수 없어요","body":"뽑기 기록에서 이전 결과를 다시 확인해 주세요. 응모권은 추가로 차감되지 않아요.","plain":true,"actions":[{"label":"뽑기 기록 다시 확인","treatment":"primary","retry":true}]},"onxeg":{"title":"방송 예정","subtitle":"팬들과 함께하는 LIVE","body":"11월 1일 오후 8시 (KST)","clock":true,"actions":[{"label":"팬페이지 홈","treatment":"neutral","href":"/nchive?locale=ko"}]},"KdGqe":{"title":"방송 종료","subtitle":"팬들과 함께하는 LIVE","body":"다시보기가 제공됩니다.","feedback":"inbox","actions":[{"label":"다시보기","treatment":"primary","href":"/nchive?view=video&locale=ko"}]},"OWIeU":{"title":"방송 종료","subtitle":"팬들과 함께하는 LIVE","body":"다시보기가 제공되지 않습니다.","feedback":"inbox","actions":[{"label":"팬페이지 홈","treatment":"neutral","href":"/nchive?locale=ko"}]},"i0KaKL":{"title":"재추첨 결과 준비 중","subtitle":"엔카이브 굿즈 추첨","body":"기존 당첨자와 수령 기한을 넘긴 회원을 제외하고 자동으로 다시 추첨하고 있어요.","note":"응모권은 추가로 차감되지 않아요.","clock":true,"actions":[{"label":"이벤트로 돌아가기","treatment":"neutral","href":"/pages/groups/e9200000-0000-4000-8000-000000000001/raffles/e9200000-0000-4000-8000-000000000001?locale=ko"}]},"cRVyO":{"title":"모션 감소가 켜져 있어요","body":"캡슐 연출을 줄이고 같은 뽑기 결과를 확인할 수 있어요.","capsule":true,"actions":[{"label":"결과 바로 보기","treatment":"primary","retry":true}]}} as const satisfies Record<string, Panel>;
export type SourceResultPanelProps = { nodeId: keyof typeof SOURCE_RESULT_PANELS; onClose: () => void; onRetry?: () => void };

/** Source-state presentation only: actions never submit a draw, exchange, or rerun. */
export function SourceResultPanel({ nodeId, onClose, onRetry }: SourceResultPanelProps) {
 const ref = useRef<HTMLDialogElement>(null), panel: Panel = SOURCE_RESULT_PANELS[nodeId];
 useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
 return <dialog ref={ref} className="sourceResultPanel" data-source-node={nodeId} data-plain={panel.plain || undefined} data-capsule={panel.capsule || undefined} aria-labelledby={`${nodeId}-title`} aria-describedby={`${nodeId}-body`} onCancel={event => { event.preventDefault(); onClose(); }}>
  <div className="sourceResultPanelContent">
   {panel.feedback && <span className="sourceResultFeedback" data-kind={panel.feedback} aria-hidden="true">{panel.feedback === 'danger' ? <CircleAlert size={24}/> : <Inbox size={24}/>}</span>}
   {panel.clock ? <header className="sourceResultHeading"><Clock3 size={24} aria-hidden="true"/><h2 id={`${nodeId}-title`}>{sourcePanelTitle(nodeId,panel.title)}</h2></header> : <h2 id={`${nodeId}-title`}>{sourcePanelTitle(nodeId,panel.title)}</h2>}
   {panel.subtitle && <strong className="sourceResultSubtitle">{panel.subtitle}</strong>}
   <SourcePanelExtra id={nodeId}/><p id={`${nodeId}-body`} style={sourcePanelTextStyle(nodeId,panel.body)}>{sourcePanelText(nodeId,panel.body)}</p>
   {panel.note && <p>{panel.note}</p>}
   {panel.capsule && <img className="sourceResultCapsule" src="/images/groups/capsule-closed.png" width={160} height={160} alt=""/>}
   <div className="sourceResultActions">{panel.actions.filter(action=>sourcePanelActionExists(nodeId,action.label)).map(action => {
    const className = `sourceResultAction sourceResultAction-${action.treatment} ${sourcePanelActionClass(nodeId,action.label)}`;
    if (action.href) return <FanAction key={action.label} href={action.href} className={className} variant={action.treatment === 'primary' ? 'primary' : 'neutral'}>{sourcePanelActionText(nodeId,action.label)}</FanAction>;
    const pending = action.treatment === 'progress' || action.treatment === 'pending';
    return <FanAction key={action.label} className={className} variant={action.treatment === 'primary' ? 'primary' : 'neutral'} disabled={pending} ariaBusy={pending} onClick={action.retry ? onRetry ?? onClose : onClose}>{sourcePanelActionText(nodeId,action.label)}</FanAction>;
   })}</div>
  </div>
 </dialog>;
}
