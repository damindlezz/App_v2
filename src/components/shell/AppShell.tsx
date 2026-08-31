'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, type ReactNode } from 'react';
import { useAppPreferences, useAppProfile, useAppRuntime } from '../../state/AppProvider';
import { ProfileGate } from './ProfileGate';
import { NurAmbient } from './NurAmbient';
import { NurHeader } from './NurHeader';
import { NurFooter } from './NurFooter';
import { OnboardingFlow } from '../../features/onboarding/OnboardingFlow';

const GlobalSearch = dynamic(
  () => import('../search/GlobalSearch').then((module) => module.GlobalSearch),
  { ssr: false }
);

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, error, busy, contentReady } = useAppRuntime();
  const { profile } = useAppProfile();
  const { preferences } = useAppPreferences();
  const [search, setSearch] = useState(false);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearch(true);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  if (!ready) return <BootShell />;
  if (!contentReady) {
    return <div className="fatal">
      <strong>Inhalte konnten nicht geladen werden.</strong>
      <p>{error}</p>
      <button onClick={() => location.reload()} className="button button--primary">Neu laden</button>
    </div>;
  }
  if (!profile) return <div className="nur-entry-shell"><NurAmbient /><ProfileGate /></div>;
  if (!preferences.onboardingComplete || preferences.onboardingVersion < 1) {
    return <div className="nur-entry-shell"><NurAmbient /><OnboardingFlow /></div>;
  }

  return <div className="app-shell app-shell--nur">
    <NurAmbient />
    <NurHeader onSearch={() => setSearch(true)} />
    <main className="workspace nur-workspace">{children}</main>
    <NurFooter />
    {search && <GlobalSearch open onClose={() => setSearch(false)} />}
    {busy && <div className="busy-line" />}
  </div>;
}

function BootShell() {
  return <div className="app-shell app-shell--nur nur-boot-shell">
    <NurAmbient />
    <NurHeader onSearch={() => undefined} />
    <main className="workspace nur-workspace">
      <section className="nur-boot-content" aria-live="polite">
        <span className="section-eyebrow">NUR</span>
        <h1>Lernraum wird vorbereitet</h1>
        <p>Inhalte und lokaler Lernstand werden parallel geladen.</p>
        <i><em /></i>
      </section>
    </main>
  </div>;
}
