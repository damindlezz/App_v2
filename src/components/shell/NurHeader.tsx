'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppLearningSummary, useAppPreferences, useAppProfile } from '../../state/AppProvider';
import { Icon, type IconName } from '../ui/Icon';
import { ROUTES, href } from './routes';
import { fiqhTrackForSchool } from '../../shared/course-track-meta';
import { THEME_OPTIONS } from '../../shared/theme-options';

type Subject = {
  label: string;
  arabic: string;
  text: string;
  href: string;
  icon: IconName;
  tone: 'teal' | 'gold' | 'lapis' | 'copper' | 'plum';
};

function hijriDate(): string {
  try {
    return new Intl.DateTimeFormat('de-DE-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());
  } catch {
    return '';
  }
}

export function NurHeader({ onSearch }: { onSearch(): void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { preferences, patchPreferences } = useAppPreferences();
  const { profile } = useAppProfile();
  const { reviewSummary, sessionSummary } = useAppLearningSummary();
  const [themesOpen, setThemesOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);
  const learnRef = useRef<HTMLDivElement>(null);
  const current = THEME_OPTIONS.find(item => item.id === preferences.colorScheme) ?? THEME_OPTIONS[0];
  const fiqh = fiqhTrackForSchool(preferences.primaryFiqhSchool);

  const subjects = useMemo<Subject[]>(() => [
    { label: 'Arabisch Fuṣḥā', arabic: 'العربية', text: 'Schrift · Wortschatz · Ṣarf · Naḥw', href: ROUTES.learn, icon: 'layers', tone: 'gold' },
    { label: 'Quran & Taǧwīd', arabic: 'القرآن', text: 'Lesen · Regeln · Sprache', href: href(ROUTES.quran, { mode: 'verstehen' }), icon: 'book', tone: 'teal' },
    { label: 'Ḥifẓ', arabic: 'الحفظ', text: 'Memorieren · Abrufen · Erhalten', href: ROUTES.hifz, icon: 'target', tone: 'plum' },
    { label: 'Fiqh & Uṣūl', arabic: 'الفقه', text: 'Madhhab · Fälle · Quellen', href: href(ROUTES.knowledge, { track: fiqh }), icon: 'compass', tone: 'lapis' },
    { label: 'Ḥadīṯ & Uṣūl', arabic: 'الحديث', text: 'Matn · Isnād · Methodik', href: href(ROUTES.knowledge, { track: 'hadith' }), icon: 'book', tone: 'copper' }
  ], [fiqh]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (themeRef.current && !themeRef.current.contains(target)) setThemesOpen(false);
      if (learnRef.current && !learnRef.current.contains(target)) setLearnOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setThemesOpen(false);
        setLearnOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, []);

  const isActive = (hrefValue: string) => hrefValue === '/' ? pathname === '/' : pathname.startsWith(hrefValue.replace(/\/$/, ''));
  const learnActive = isActive(ROUTES.learn) || pathname.startsWith('/wissen') || pathname.startsWith('/bereich') || pathname.startsWith('/hifz');
  const dateLabel = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());

  return <header className="nur-topbar ref-topbar">
    <div className="ref-topbar-glow" aria-hidden="true" />
    <div className="nur-top-inner ref-top-inner">
      <div className="nur-top-row ref-top-row">
        <Link href={ROUTES.today} className="nur-brand ref-brand" aria-label="NŪR Startseite">
          <span className="nur-brand-mark ref-brand-sigil"><Icon name="sparkles" size={25} /></span>
          <span className="ref-brand-copy"><strong>NŪR<span>.</span></strong><small>Quran Akademie</small></span>
          <b dir="rtl">نُور</b>
        </Link>

        <nav className="nur-main-nav ref-main-nav" aria-label="Hauptnavigation">
          <Link href={ROUTES.today} className={isActive(ROUTES.today) ? 'is-active' : ''}><Icon name="star" size={15}/><span>Heute</span></Link>
          <div className="nur-nav-drop ref-nav-drop" ref={learnRef}>
            <button className={learnActive ? 'is-active' : ''} onClick={() => setLearnOpen(value => !value)} aria-expanded={learnOpen}>
              <Icon name="layers" size={15}/><span>Lernen</span><Icon name="chevron" size={12}/>
            </button>
            {learnOpen && <div className="nur-learn-menu ref-learn-menu view-enter" role="menu">
              <div className="ref-learn-head"><span>Fächer</span><b dir="rtl">طَلَبُ الْعِلْم</b></div>
              {subjects.map(subject => <Link key={subject.label} href={subject.href} onClick={() => setLearnOpen(false)} className={`ref-subject-row ref-tone-${subject.tone}`} role="menuitem">
                <span className="ref-subject-icon"><Icon name={subject.icon} size={18}/></span>
                <div><strong>{subject.label}</strong><small>{subject.text}</small></div>
                <b dir="rtl">{subject.arabic}</b>
              </Link>)}
              <div className="ref-learn-utility">
                <Link href={ROUTES.library} onClick={() => setLearnOpen(false)}>Bibliothek</Link>
                <Link href={ROUTES.sources} onClick={() => setLearnOpen(false)}>Quellen</Link>
              </div>
            </div>}
          </div>
          <Link href={ROUTES.quran} className={isActive(ROUTES.quran) ? 'is-active' : ''}><Icon name="book" size={15}/><span>Muṣḥaf</span></Link>
          <Link href={ROUTES.practice} className={isActive(ROUTES.practice) ? 'is-active' : ''}><Icon name="grid" size={15}/><span>Training</span></Link>
          <Link href={ROUTES.progress} className={isActive(ROUTES.progress) ? 'is-active' : ''}><Icon name="chart" size={15}/><span>Fortschritt</span></Link>
        </nav>

        <div className="nur-tools ref-tools">
          <div className="ref-date-block">
            <strong>{hijriDate()}</strong><small>{dateLabel}</small>
          </div>
          <Link href={ROUTES.review} className="ref-streak-chip" title={`${reviewSummary.dueNow} Wiederholungen fällig`}>
            <Icon name="flame" size={16}/><span><b>{sessionSummary.currentStreak}</b><small>Tage</small></span>
          </Link>
          <button className="ref-round-action" onClick={onSearch} title="Suche" aria-label="Suche"><Icon name="search" size={17}/></button>
          <div className="nur-theme-wrap ref-theme-wrap" ref={themeRef}>
            <button className="ref-round-action ref-theme-action" onClick={() => setThemesOpen(value => !value)} title="Farbwelt wählen" aria-expanded={themesOpen}>
              <i style={{ background: `linear-gradient(135deg,${current.base} 52%,${current.accent} 52%)` }} />
            </button>
            {themesOpen && <div className="nur-theme-menu ref-theme-menu view-enter"><small>Farbwelt</small>{THEME_OPTIONS.map(theme => <button key={theme.id} className={theme.id === current.id ? 'is-active' : ''} onClick={() => { void patchPreferences(draft => { draft.colorScheme = theme.id; }); setThemesOpen(false); }}><i style={{ background: `linear-gradient(135deg,${theme.base} 52%,${theme.accent} 52%)` }}/><span><strong>{theme.name}</strong><small>{theme.hint}</small></span>{theme.id === current.id && <Icon name="check" size={15}/>}</button>)}</div>}
          </div>
          <Link href={ROUTES.settings} className="ref-profile-action" title="Profil & Einstellungen" aria-label="Profil und Einstellungen"><span>{profile?.avatar ?? '◌'}</span><small>{profile?.name ?? 'Profil'}</small></Link>
        </div>
      </div>
    </div>

    <nav className="nur-mobile-nav ref-mobile-nav" aria-label="Mobile Navigation">
      <Link href={ROUTES.today} className={isActive(ROUTES.today) ? 'is-active' : ''}><Icon name="home" size={19}/><span>Heute</span></Link>
      <Link href={ROUTES.learn} className={learnActive ? 'is-active' : ''}><Icon name="layers" size={19}/><span>Lernen</span></Link>
      <Link href={ROUTES.quran} className={isActive(ROUTES.quran) ? 'is-active' : ''}><Icon name="book" size={19}/><span>Muṣḥaf</span></Link>
      <Link href={ROUTES.practice} className={isActive(ROUTES.practice) ? 'is-active' : ''}><Icon name="grid" size={19}/><span>Training</span></Link>
      <button onClick={() => router.push(ROUTES.progress)} className={isActive(ROUTES.progress) ? 'is-active' : ''}><Icon name="chart" size={19}/><span>Fortschritt</span></button>
    </nav>
  </header>;
}
