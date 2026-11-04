'use client';

import {useState, type FormEvent} from 'react';
import {Search} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import styles from './creator-board-footer.module.css';

type Props = {
  allHref?: string;
  writeHref?: string;
  searchLabel: string;
  allLabel?: string;
  writeLabel?: string;
  onSearch: (query: string) => void;
};

export function CreatorBoardFooter({allHref, writeHref, searchLabel, allLabel, writeLabel, onSearch}: Props) {
  const [draft, setDraft] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(draft.trim());
  }
  return <div className={styles.footer}>
    <form className={styles.search} role="search" onSubmit={submit}>
      <input type="search" maxLength={100} aria-label={searchLabel} placeholder={searchLabel} value={draft} onChange={event => setDraft(event.target.value)} />
      <button type="submit" aria-label={searchLabel}><Search size={20} aria-hidden="true" /></button>
    </form>
    {((allHref && allLabel) || (writeHref && writeLabel)) && <div className={styles.actions}>
      {allHref && allLabel && <FanAction href={allHref} variant="neutral">{allLabel}</FanAction>}
      {writeHref && writeLabel && <FanAction href={writeHref} variant="primary">{writeLabel}</FanAction>}
    </div>}
  </div>;
}
