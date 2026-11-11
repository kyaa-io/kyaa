import { notFound } from 'next/navigation';
import { localSignupEnabled } from '@/server/signup-event/local';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { SignupEventExports } from './exports';
import styles from '../../s/raffle/raffle.module.css';
export default function SignupEventAdminPage() {
 if(!localSignupEnabled())notFound();
 return <main className={styles.event}><FanHeading as="h1">KYAA 래플</FanHeading><SignupEventExports /></main>;
}
