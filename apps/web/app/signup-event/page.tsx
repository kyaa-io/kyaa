import { FanText } from "@/components/fan-ui/fan-text";
import { SignupEventSharing } from "./sharing";
import { notFound } from 'next/navigation';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { localSignupEnabled } from '@/server/signup-event/local';
import styles from './signup-event.module.css';
export const dynamic = 'force-dynamic';
export default function SignupEventPage() {
  if (!localSignupEnabled()) notFound();
  return <main className={styles.event}>
    <FanHeading as="h1">신규 가입 이벤트</FanHeading>
    <FanText as="p" role="body">11월 11일 00:00부터 11월 24일 23:59까지(KST)</FanText>
    <FanText as="p" role="body">기간 내 신규 가입하면 자동으로 1회 응모돼요.</FanText>
    <FanText as="p" role="body">공유 링크를 통한 클릭·가입과 출석·글 작성으로 당첨 확률을 높여 보세요.</FanText>
    <FanHeading>상품 확정 전</FanHeading>
    <SignupEventSharing />
  </main>;
}
