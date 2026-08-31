'use client';

import { useEffect, type ReactNode } from 'react';
import { AppProvider } from '../src/state/AppProvider';

async function clearDevelopmentServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const isTauri = Boolean(window.__TAURI_INTERNALS__);
    const isProductionWeb = process.env.NODE_ENV === 'production' && !isTauri && location.protocol.startsWith('http');

    if (!isProductionWeb) {
      void clearDevelopmentServiceWorkers();
      return;
    }

    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  return <AppProvider>{children}</AppProvider>;
}
