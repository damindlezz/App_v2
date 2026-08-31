'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '../ui/Icon';
import { ROUTES } from './routes';

const HIDE_ON = ['/quran', '/hifz', '/modul', '/ueben', '/wiederholen'];

export function NurFooter() {
  const pathname = usePathname();
  if (HIDE_ON.some(prefix => pathname.startsWith(prefix))) return null;

  return <footer className="ref-footer">
    <div className="ref-footer-grid">
      <div className="ref-footer-brand">
        <div><span className="ref-brand-sigil"><Icon name="sparkles" size={23}/></span><strong>NŪR<span>.</span></strong><b dir="rtl">نُور</b></div>
        <p>Ein ruhiger Lernraum für Quran, Arabisch, Ḥifẓ und islamische Wissenschaften — systematisch, quellenbewusst und wiederholungsorientiert.</p>
      </div>
      <div><span className="ref-footer-eyebrow">Lernräume</span><nav><Link href={ROUTES.learn}>Arabisch</Link><Link href={ROUTES.quran}>Muṣḥaf</Link><Link href={ROUTES.hifz}>Ḥifẓ</Link><Link href={ROUTES.knowledge}>Wissenschaften</Link></nav></div>
      <div><span className="ref-footer-eyebrow">Werkzeuge</span><nav><Link href={ROUTES.practice}>Training</Link><Link href={ROUTES.review}>Wiederholen</Link><Link href={ROUTES.library}>Bibliothek</Link><Link href={ROUTES.sources}>Quellen</Link></nav></div>
      <div className="ref-footer-adab"><span className="ref-footer-eyebrow">Adab des Lernens</span><p>Die App strukturiert Lernen und Wiederholen. Fachfragen bleiben an qualifizierte Lehrer und belastbare Quellen gebunden.</p><b dir="rtl">رَبِّ زِدْنِي عِلْمًا</b></div>
    </div>
  </footer>;
}
