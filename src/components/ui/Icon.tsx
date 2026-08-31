'use client';

import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'home' | 'book' | 'target' | 'repeat' | 'compass' | 'grid' | 'chart' | 'settings'
  | 'search' | 'play' | 'pause' | 'bookmark' | 'more' | 'font' | 'headphones'
  | 'gap' | 'drag' | 'matching' | 'check' | 'arrow' | 'chevron' | 'user' | 'close'
  | 'star' | 'volume' | 'pen' | 'warning' | 'lock' | 'clock' | 'flame' | 'sparkles'
  | 'download' | 'trash' | 'plus' | 'menu' | 'microphone' | 'eye' | 'layers';

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

const paths: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>,
  book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23.5Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23.5Z"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  repeat: <><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></>,
  compass: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9Z"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  chart: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8 8 0 0 0-1.8-1L14 3h-4l-.6 3a8 8 0 0 0-1.8 1L5 6 3 9.4 5.1 11a7 7 0 0 0 0 2L3 14.6 5 18l2.6-1a8 8 0 0 0 1.8 1l.6 3h4l.6-3a8 8 0 0 0 1.8-1l2.6 1 2-3.4-2.1-1.6c.1-.3.1-.7.1-1Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  play: <path d="m9 6 9 6-9 6Z"/>, pause: <><path d="M9 6v12"/><path d="M15 6v12"/></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z"/>, more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  font: <><path d="M4 20 10 4h4l6 16"/><path d="M7 13h10"/></>,
  headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1Z"/><path d="M20 14h-3v6h2a1 1 0 0 0 1-1Z"/></>,
  gap: <><path d="M4 8h5"/><path d="M15 8h5"/><path d="M10.5 8h3"/><path d="M4 16h7"/><path d="M15 16h5"/><path d="M12 14v4"/></>,
  drag: <><path d="M8 5h.01M8 12h.01M8 19h.01M16 5h.01M16 12h.01M16 19h.01"/><rect x="3" y="3" width="18" height="18" rx="4"/></>,
  matching: <><path d="M4 7h7"/><path d="M13 7h7"/><path d="M4 17h7"/><path d="M13 17h7"/><path d="m10 7 4 10"/><path d="m14 7-4 10"/></>,
  check: <path d="m5 12 4 4 10-10"/>, arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>, chevron: <path d="m9 6 6 6-6 6"/>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>, close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>,
  volume: <><path d="M4 10v4h4l5 4V6L8 10Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></>,
  pen: <><path d="m4 20 4-1 10-10-3-3L5 16Z"/><path d="m13 7 3 3"/></>, warning: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4M12 17h.01"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  flame: <path d="M13 22c4 0 7-3 7-7 0-3-1.7-5.3-4.5-8 .2 2-1 3.5-2 4.3.2-4-2-7-5.5-9.3.3 3-1.7 5.1-3 7.2C3.5 11.4 3 13 3 15c0 4 3 7 7 7Z"/>,
  sparkles: <><path d="m12 3 1.2 3.2L16 7.5l-2.8 1.3L12 12l-1.2-3.2L8 7.5l2.8-1.3Z"/><path d="m19 13 .7 1.8 1.8.7-1.8.7L19 18l-.7-1.8-1.8-.7 1.8-.7Z"/></>,
  download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></>, trash: <><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 14h8l1-14"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>, menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  microphone: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></>, eye: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></>
};

export function Icon({ name, size = 20, ...props }: Props) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
