'use client';

import type { ReactNode } from 'react';
import { Icon } from '../../components/ui/Icon';

export type StudyContextKind = 'focus' | 'evidence' | 'error' | 'review' | 'prerequisite' | 'word' | 'source';
export interface StudyContextState {
  kind: StudyContextKind;
  eyebrow: string;
  title: string;
  description?: string;
  body?: ReactNode;
  status?: string;
  action?: { label: string; onClick(): void };
}

export function StudyContextRail({ state, className = 'study-context', open = false, onClose }: { state: StudyContextState; className?: string; open?: boolean; onClose(): void }) {
  return <aside className={`${className}${open ? ' is-mobile-open' : ''}`} data-context-state={state.kind}>
    <div className="study-context-head"><span>CONTEXT RAIL</span><button onClick={onClose} aria-label="Kontext schliessen"><Icon name="close" size={17}/></button></div>
    <section className={`study-context-state is-${state.kind}`}>
      <span>{state.eyebrow}</span>
      <h2>{state.title}</h2>
      {state.description && <p>{state.description}</p>}
      {state.body}
      {state.action && <button className="study-context-link" onClick={state.action.onClick}>{state.action.label} <Icon name="arrow" size={13}/></button>}
    </section>
    {state.status && <footer className="study-context-status">{state.status}</footer>}
  </aside>;
}
