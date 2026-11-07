"use client";
import type { ReactNode } from "react";
import paper from "@/components/fan-ui/passport-paper.module.css";
import styles from "./passport-book.module.css";

/** Stamped seal of the cover: kyaa's own heart inside a double ring, no third-party art. */
export function PassportEmblem({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="29" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="32" cy="32" r="24.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
    <path d="M32 46c-9-6.200-13.500-10.800-13.500-16.200 0-4.200 3.100-7.300 7-7.300 2.700 0 5.100 1.500 6.500 3.900 1.400-2.400 3.800-3.900 6.500-3.900 3.900 0 7 3.100 7 7.300C45.500 35.200 41 39.800 32 46Z" fill="currentColor" />
  </svg>;
}

export const shortFanId = (id: string) => id.slice(0, 8).toUpperCase();

/** Passport book: facing identity and stamp pages from 1024px; below that one column, a short identity strip with the mission book directly under it. */
export function PassportBook({ label, fanName, longFanName, starName, star, issuedOn, fanId, avatar, children }: {
  label: string; fanName: string; longFanName: boolean; starName: string; star: ReactNode; issuedOn: string; fanId: string; avatar: ReactNode; children: ReactNode;
}) {
  const short = shortFanId(fanId);
  return <section className={`${paper.palette} ${styles.book}`} aria-label={label} data-passport-book>
    <div className={styles.identityLeaf}>
      <div className={styles.cover} aria-hidden="true"><PassportEmblem className={styles.emblem} /><span>FAN PASSPORT</span><b>kyaa.</b></div>
      <div className={styles.identityPage}>
        <PassportEmblem className={styles.watermark} />
        <div className={styles.identityHead}><strong>FAN PASSPORT</strong><span dir="ltr">No. {short}</span></div>
        <div className={styles.identityBody}>
          <div className={styles.photo} data-fan-avatar>{avatar}</div>
          <dl className={styles.fields}>
            <div><dt>FAN NAME</dt><dd data-long-name={longFanName} aria-label={`FAN NAME: ${fanName}`} data-passport-field="fan-name" dir="auto">{fanName}</dd></div>
            <div><dt>STAR</dt><dd aria-label={`STAR: ${starName}`} data-passport-field="star">{star}</dd></div>
            <div><dt>DATE OF ISSUE</dt><dd className={styles.tabular} aria-label={`DATE OF ISSUE: ${issuedOn}`} data-passport-field="issue-date">{issuedOn}</dd></div>
            <div><dt>FAN ID</dt><dd className={styles.tabular} aria-label={`FAN ID: ${short}`} data-passport-field="fan-id" dir="ltr">{short}</dd></div>
          </dl>
        </div>
        <p className={styles.machineLine} aria-hidden="true" dir="ltr">P&lt;KYAA&lt;&lt;{short}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br />{short}&lt;{issuedOn.replace(/\D/g, "")}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p>
      </div>
    </div>
    <div className={styles.stampLeaf}>{children}</div>
  </section>;
}
