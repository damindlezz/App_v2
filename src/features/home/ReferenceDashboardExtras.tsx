'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../../components/ui/Icon';
import { ROUTES, href } from '../../components/shell/routes';

const METHOD_STEPS: Array<{ n: string; title: string; text: string; href: string; icon: IconName }> = [
  { n: '01', title: 'Quran lesen', text: 'Muṣḥaf, Zeichen und Taǧwīd als sichere Grundlage.', href: ROUTES.quran, icon: 'book' },
  { n: '02', title: 'Arabisch Fuṣḥā', text: 'Schrift, Wortschatz, Ṣarf, Naḥw und Satzbau systematisch verbinden.', href: ROUTES.learn, icon: 'layers' },
  { n: '03', title: 'Ḥifẓ & Murāǧaʿa', text: 'Memorieren, aktiv abrufen und mit Wiederholungsintervallen stabilisieren.', href: ROUTES.hifz, icon: 'target' },
  { n: '04', title: 'Fiqh & Ḥadīṯ', text: 'Fachwissen methodisch lernen, Quellen einordnen und Fälle analysieren.', href: ROUTES.knowledge, icon: 'compass' }
];

const PRAYERS = [
  ['fajr', 'Faǧr'], ['dhuhr', 'Ẓuhr'], ['asr', 'ʿAṣr'], ['maghrib', 'Maġrib'], ['isha', 'ʿIšāʾ']
] as const;

type PrayerKey = typeof PRAYERS[number][0];
type PrayerPlan = Record<PrayerKey, string>;
const EMPTY_PRAYER_PLAN: PrayerPlan = { fajr: '', dhuhr: '', asr: '', maghrib: '', isha: '' };
const PRAYER_STORAGE_KEY = 'nur:manual-prayer-plan:v1';
const TASBIH_STORAGE_KEY = 'nur:tasbih:v1';

export function ReferenceDashboardExtras() {
  return <div className="ref-home-extras">
    <MethodJourney />
    <div className="ref-daily-tools"><PrayerPlanner/><TasbihWidget/></div>
  </div>;
}

function MethodJourney() {
  return <section className="ref-method-section">
    <div className="ref-section-head"><div><span className="section-eyebrow">Die Methode</span><h2>Vier Etappen — ein gemeinsamer Lernweg.</h2></div><Link href={ROUTES.progress} className="ref-ghost-pill">Landkarte des Lernens <Icon name="arrow" size={14}/></Link></div>
    <div className="ref-method-grid">
      {METHOD_STEPS.map((step, index) => <Link href={step.href} key={step.n} className="ref-method-card">
        <span className="ref-method-number">{step.n}</span><i className="ref-method-node"><b/></i>
        <div className="ref-method-icon"><Icon name={step.icon} size={18}/></div>
        <small>Etappe {index + 1}</small><strong>{step.title}</strong><p>{step.text}</p>
      </Link>)}
    </div>
  </section>;
}

function PrayerPlanner() {
  const [plan, setPlan] = useState<PrayerPlan>(EMPTY_PRAYER_PLAN);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRAYER_STORAGE_KEY);
      if (raw) setPlan({ ...EMPTY_PRAYER_PLAN, ...JSON.parse(raw) });
    } catch { /* local-only enhancement */ }
    setLoaded(true);
  }, []);

  function save(next: PrayerPlan) {
    setPlan(next);
    try { localStorage.setItem(PRAYER_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage can be unavailable */ }
  }

  const configured = Object.values(plan).filter(Boolean).length;
  return <section className="ref-ornament-panel ref-prayer-panel">
    <div className="ref-panel-head"><div><span className="section-eyebrow">Tagesrhythmus</span><h3>Ṣalāh-Zeiten als persönlicher Tagesanker</h3><p>Optional manuell hinterlegen. Die App berechnet bewusst keine religiösen Zeiten ohne gewählte Methode und Standort.</p></div><button className="ref-round-action" onClick={() => setEditing(value => !value)} title="Zeiten bearbeiten"><Icon name="pen" size={16}/></button></div>
    <div className="ref-prayer-grid" aria-live="polite">
      {PRAYERS.map(([key, label]) => <label className={plan[key] ? 'is-configured' : ''} key={key}><span>{label}</span>{editing ? <input type="time" value={plan[key]} onChange={event => save({ ...plan, [key]: event.target.value })}/> : <strong>{loaded ? (plan[key] || '—:—') : '…'}</strong>}</label>)}
    </div>
    <div className="ref-prayer-foot"><span><Icon name="clock" size={14}/>{configured ? `${configured}/5 Zeiten gespeichert` : 'Noch keine Zeiten hinterlegt'}</span>{editing && <button onClick={() => setEditing(false)}>Fertig</button>}</div>
  </section>;
}

function TasbihWidget() {
  const [count, setCount] = useState(0);
  const [phrase, setPhrase] = useState<'subhanallah' | 'alhamdulillah' | 'allahuakbar'>('subhanallah');
  const target = 33;
  const progress = Math.min(count / target, 1);
  const circumference = 2 * Math.PI * 42;
  const labels = {
    subhanallah: ['سُبْحَانَ ٱللَّٰهِ', 'Subḥān Allāh'],
    alhamdulillah: ['ٱلْحَمْدُ لِلَّٰهِ', 'Al-ḥamdu li-llāh'],
    allahuakbar: ['ٱللَّٰهُ أَكْبَرُ', 'Allāhu akbar']
  } as const;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TASBIH_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as { count?: number; phrase?: typeof phrase };
      if (Number.isFinite(stored.count)) setCount(Math.max(0, Number(stored.count)));
      if (stored.phrase && stored.phrase in labels) setPhrase(stored.phrase);
    } catch { /* local-only enhancement */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(TASBIH_STORAGE_KEY, JSON.stringify({ count, phrase })); } catch { /* local-only enhancement */ }
  }, [count, phrase]);

  const remaining = useMemo(() => count < target ? `${target - count} bis ${target}` : `${Math.floor(count / target)} Runde${count >= target * 2 ? 'n' : ''}`, [count]);

  return <section className="ref-ornament-panel ref-dhikr-panel">
    <div><span className="section-eyebrow">Dhikr</span><h3>Digitaler Tasbīḥ</h3></div>
    <button className="ref-tasbih-ring" onClick={() => setCount(value => value + 1)} aria-label="Tasbih erhöhen">
      <svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="42" className="ref-tasbih-track"/><circle cx="48" cy="48" r="42" className="ref-tasbih-progress" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - progress), transform: 'rotate(-90deg)', transformOrigin: '48px 48px' }}/></svg>
      <strong>{count}</strong><small>{remaining}</small>
    </button>
    <div className="ref-dhikr-copy"><b dir="rtl">{labels[phrase][0]}</b><span>{labels[phrase][1]}</span></div>
    <div className="ref-dhikr-actions"><button onClick={() => setPhrase(phrase === 'subhanallah' ? 'alhamdulillah' : phrase === 'alhamdulillah' ? 'allahuakbar' : 'subhanallah')}><Icon name="repeat" size={14}/> Wechseln</button><button onClick={() => setCount(0)}><Icon name="trash" size={14}/> Reset</button></div>
  </section>;
}
