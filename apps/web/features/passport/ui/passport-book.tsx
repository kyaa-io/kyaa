"use client";
import Image from "next/image";
import type { ReactNode } from "react";
import paper from "@/components/fan-ui/passport-paper.module.css";
import styles from "./passport-book.module.css";

export const shortFanId = (id: string) => id.slice(0, 8).toUpperCase();

/** Passport book: facing identity and stamp pages from 1024px; below that one column, a short identity strip with the mission book directly under it. */
export function PassportBook({ label, fanName, longFanName, starName, star, issuedOn, fanId, avatar, children }: {
  label: string; fanName: string; longFanName: boolean; starName: string; star: ReactNode; issuedOn: string; fanId: string; avatar: ReactNode; children: ReactNode;
}) {
  const short = shortFanId(fanId);
  return <section className={`${paper.palette} ${styles.book}`} aria-label={label} data-passport-book>
    <div className={styles.identityLeaf}>
      <div className={styles.cover} aria-hidden="true"><i className={styles.logo} /><span>FAN PASSPORT</span></div>
      <div className={styles.identityPage}>
        <Image className={styles.watermark} src="/images/passport/kyaa-seal.png" alt="" width={220} height={220} aria-hidden="true" />
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
