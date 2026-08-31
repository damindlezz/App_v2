'use client';

import type { ReactNode } from 'react';
import { Icon } from '../../components/ui/Icon';

export function StudyLedgerShell({ className = '', mainClassName = 'study-ledger-main', open = false, children }: { className?: string; mainClassName?: string; open?: boolean; children: ReactNode }) {
  return <aside className={`${className}${open ? ' is-mobile-open' : ''}`}><div className={mainClassName}>{children}</div></aside>;
}

export function StudyLedgerHeader({ onClose }: { onClose(): void }) {
  return <div className="study-ledger-topline"><strong>KURRIKULUM</strong><button className="study-ledger-close" onClick={onClose} aria-label="Kurrikulum schliessen"><Icon name="close" size={18}/></button></div>;
}

export function StudyLedgerProgress({ label, value, detail }: { label: string; value: number; detail?: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className="study-ledger-progress"><div><strong>{label}</strong><span>{detail ?? `${Math.round(safe)}%`}</span></div><i><em style={{ width: `${safe}%` }}/></i></div>;
}

export function StudyLedgerReview({ count, onOpen, label = 'Review-Queue öffnen' }: { count?: number; onOpen(): void; label?: string }) {
  return <button className="study-ledger-review" disabled={count === 0} onClick={onOpen}><Icon name="repeat" size={17}/><span><small>Wiederholungen</small><strong>{count === undefined ? label : count > 0 ? `${count} fällig` : 'Keine fällig'}</strong></span><Icon name="arrow" size={15}/></button>;
}
