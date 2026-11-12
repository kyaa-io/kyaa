import type {ReactNode} from 'react';
import Link from "../fan-ui/hover-prefetch-link";
import {ShieldCheck} from 'lucide-react';
import styles from './group-admin.module.css';
export function GroupAdminShell({locale,children}:{locale:'ko'|'en';children:ReactNode}){
 return <div className={styles.platformShell}><header className={styles.platformHeader}><Link href={locale==='ko'?'/admin/groups/overview':'/admin/groups/overview?lang=en'}><ShieldCheck size={28} aria-hidden="true"/><span>{locale==='ko'?'Kyaa 전체 관리':'Kyaa administration'}</span></Link><span>{locale==='ko'?'플랫폼 관리자 전용':'Platform administrators only'}</span></header><main>{children}</main></div>;
}
