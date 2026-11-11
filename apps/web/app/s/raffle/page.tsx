import { notFound } from 'next/navigation';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { FanText } from '@/components/fan-ui/fan-text';
import { localSignupEnabled } from '@/server/signup-event/local';
import { signupEvent } from '@/features/benefit/domain/signup-event';
import { RaffleParticipation } from './participation';
import styles from './raffle.module.css';
export const dynamic='force-dynamic';
export const metadata={title:'KYAA 래플',description:'US$400 · 17명. KYAA에서 응모하고 Fan Passport를 받아 커뮤니티에 가입하세요. 11월 30일 마감.'};
export default function RafflePage() {
 if(!localSignupEnabled())notFound();
 return <main className={styles.event}>
  <FanHeading as="h1">KYAA 래플</FanHeading>
  <FanText as="p" role="item">US$400 · 17명</FanText>
  <FanText as="p" role="body">11월 30일 마감</FanText>
  <ul>{signupEvent.prizes.map(prize=><li key={prize.usd} data-row="raffle-prize"><FanText role="body">${prize.usd} × {prize.quantity}명</FanText></li>)}</ul>
  <ol>
   <li data-row="raffle-step"><FanText role="body">KYAA에서 응모하세요.</FanText></li>
   <li data-row="raffle-step"><FanText role="body">Fan Passport를 받으세요.</FanText></li>
   <li data-row="raffle-step"><FanText role="body">KYAA 커뮤니티에 가입하세요.</FanText></li>
  </ol>
  <FanText as="p" role="body">댓글을 남기고 출석 체크를 하면 당첨 확률을 높일 수 있어요.</FanText>
  <RaffleParticipation />
 </main>;
}
