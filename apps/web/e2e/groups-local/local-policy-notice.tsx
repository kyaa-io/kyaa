import {useId,useState} from 'react';
import {Dialog} from '@/components/ui/overlay/accessible-overlay';
import {FanAction} from '@/components/fan-ui/fan-action';
import styles from '../../features/group-wallet/ui/wallet.module.css';
import {localPolicy as p} from './local-policy-fixture';
export function LocalPolicyNotice(){
 const [open,setOpen]=useState(false),title=useId(),action=(id:string)=>p.actions.find(a=>a.id===id)!;
 return <><div style={{display:'flex',justifyContent:'flex-end',padding:'8px 16px',marginBottom:'calc(80px + env(safe-area-inset-bottom))'}}><FanAction className={styles.localPolicyTrigger} onClick={()=>setOpen(true)} aria-expanded={open}>로컬 초안</FanAction></div>
 <Dialog open={open} onClose={()=>setOpen(false)} labelledBy={title} backdropClassName={styles.supportBackdrop} contentClassName={styles.supportDialog}>
 <header className={styles.supportDialogHeader}><h2 id={title}>로컬 정책 초안 B</h2><FanAction onClick={()=>setOpen(false)}>닫기</FanAction></header><p>합성 데이터 · 제안 정책</p><p>좋아요 {action('reaction').points}P · 하루 {action('reaction').daily_cap}회 / 댓글·새 글 {action('comment').points}P · 합산 하루 {action('comment').shared_daily_cap}회. 유효한 활동만 대상이며 본인 좋아요·중복·취소 후 재시도는 제외합니다.</p><p>첫 활동·승인 미션은 같은 작성물 총 {p.dedup.same_source_total_max}P로 대체합니다. 이미 {action('comment').points}P를 받았다면 {p.dedup.already_paid_5_topup}P 추가, 첫 활동과 미션은 중복되지 않습니다. 미션은 예약 슬롯·검수 승인 후 일 {action('approved_mission').daily_cap}회 / 월 {action('approved_mission').monthly_cap}회입니다.</p><p>공통 출석 {action('attendance').points}P, {action('attendance_streak').every_consecutive_days}일 연속 추가 {action('attendance_streak').points}P. {p.exchange.points_per_unit}P당 하트·공식 응모권 1개, 합산 일 {p.exchange.shared_daily_units}개 / 월 {p.exchange.shared_monthly_units}개 교환 제안. 신규 파일럿 {p.expiry.new_pilot_months}개월 만료는 제안이며 기존 잔액에 적용하지 않습니다.</p><p>운영 지급·실잔액·기존 creator 정책은 바뀌지 않습니다. 첫 활동/미션 승인·만료 처리는 이 화면에서 실제 실행하지 않습니다.</p></Dialog></>;
}
