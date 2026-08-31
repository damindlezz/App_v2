'use client';

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  useAppContent,
  useAppPreferences,
  useAppProfile,
  useAppRuntime,
} from '../../state/AppProvider';
import type {
  ArabicFontPreference,
  BackupPackage,
  CefrLevel,
  CourseTrack,
  HarakatModule,
  HarakatOverride,
  HarakatPreference,
  ThemeMode,
} from '../../types/models';
import { courseTrackLabel } from '../../shared/course-track-meta';
import { THEME_OPTIONS } from '../../shared/theme-options';
import { listArabicVoices, onVoicesChanged } from '../../services/audio/audio-service';
import {
  cacheQuranAudioForSurah,
  clearOfflineAudio,
  formatBytes,
  getOfflineContentStatus,
  type OfflineContentStatus,
} from '../../services/storage/offline-content-service';
import { Icon } from '../../components/ui/Icon';
import { PageHeading, Surface } from '../../components/ui/Surface';
import { StudyUtilityFrame } from '../study/StudyUtilityFrame';

const LEVELS: CefrLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TRACKS: CourseTrack[] = [
  'fusha',
  'quran',
  'fiqh_hanafi',
  'fiqh_maliki',
  'fiqh_shafii',
  'fiqh_hanbali',
  'usul_fiqh',
  'hadith',
  'usul_hadith',
];
const FONTS: ArabicFontPreference[] = ['naskh', 'uthmani', 'turkish', 'sans', 'kufi', 'system'];
const HARAKAT: HarakatPreference[] = ['show', 'hide', 'learning'];
const HARAKAT_MODULES: Array<{ id: HarakatModule; label: string }> = [
  { id: 'vocabulary', label: 'Wortschatz' },
  { id: 'grammar', label: 'Grammatik' },
  { id: 'writing', label: 'Schreiben' },
  { id: 'reading', label: 'Lesen' },
  { id: 'quran', label: 'Quran' },
  { id: 'exercises', label: 'Uebungen' },
];

export function SettingsPage() {
  const { content, ensureQuranReader } = useAppContent();
  const {
    profile,
    profiles,
    switchProfile,
    exportBackup,
    importBackup,
    reset,
    deleteCurrentProfile,
  } = useAppProfile();
  const { preferences, patchPreferences } = useAppPreferences();
  const { storageMode } = useAppRuntime();
  const [notice, setNotice] = useState<string | null>(null);
  const [voices, setVoices] = useState(() => listArabicVoices());
  const [offline, setOffline] = useState<OfflineContentStatus | null>(null);
  const [offlineSurah, setOfflineSurah] = useState(1);

  useEffect(() => onVoicesChanged(() => setVoices(listArabicVoices())), []);

  useEffect(() => {
    if (content) void getOfflineContentStatus(content).then(setOffline);
  }, [content]);

  async function backup() {
    try {
      const data = await exportBackup();
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `arabisch-lernen-${profile?.name ?? 'profil'}-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice('Backup exportiert.');
    } catch {
      setNotice('Backup konnte nicht exportiert werden.');
    }
  }

  async function restore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as BackupPackage;
      await importBackup(data, { name: `${data.profile?.name ?? 'Profil'} Import` });
      setNotice('Backup importiert.');
    } catch {
      setNotice('Backup konnte nicht importiert werden.');
    } finally {
      event.target.value = '';
    }
  }

  async function cacheSurah() {
    if (!content) return;
    await ensureQuranReader([offlineSurah]);
    const result = await cacheQuranAudioForSurah(content, offlineSurah);
    setNotice(`${result.cached}/${result.total} Audiodateien offline.`);
    setOffline(await getOfflineContentStatus(content));
  }

  async function clearAudio() {
    await clearOfflineAudio();
    if (content) setOffline(await getOfflineContentStatus(content));
    setNotice('Audio-Cache geleert.');
  }

  async function toggleTrack(track: CourseTrack) {
    await patchPreferences(draft => {
      const has = draft.enabledTracks.includes(track);
      draft.enabledTracks = has
        ? draft.enabledTracks.filter(item => item !== track)
        : [...draft.enabledTracks, track];
      if (!draft.enabledTracks.length) draft.enabledTracks = ['fusha'];
    });
  }

  return (
    <StudyUtilityFrame active="settings">
      <div className="page page--settings">
        <PageHeading
          eyebrow="Einstellungen"
          title="App und Lernen steuern"
          description="Darstellung, Lernlogik, Audio, Offline-Daten und Backups."
        />
        {notice && <div className="inline-alert inline-alert--success">{notice}</div>}

        <div className="settings-stack">
          <Surface className="settings-card">
            <div className="settings-card__heading">
              <div>
                <span className="eyebrow">Profil</span>
                <h2>{profile?.name}</h2>
              </div>
              <span className="profile-avatar">{profile?.avatar}</span>
            </div>
            <Row title="Profil wechseln" meta={`${profiles.length} lokale Profile`}>
              <button className="button button--secondary" onClick={switchProfile}>
                <Icon name="user" size={18} /> Wechseln
              </button>
            </Row>
            <Row
              title="Speicher"
              meta={storageMode === 'tauri-sqlite' ? 'SQLite - Desktop/Android' : 'IndexedDB - Browser/PWA'}
            >
              <span className="status-dot">lokal</span>
            </Row>
          </Surface>

          <Surface className="settings-card">
            <Heading eyebrow="Darstellung" title="Oberfläche" />
            <Stack title="Farbwelt" meta="P0–P3 Designsystem · im Profil gespeichert">
              <div className="nur-theme-grid">
                {THEME_OPTIONS.map(theme => (
                  <button
                    key={theme.id}
                    className={`nur-theme-choice ${preferences.colorScheme === theme.id ? 'is-active' : ''}`}
                    onClick={() =>
                      void patchPreferences(draft => {
                        draft.colorScheme = theme.id;
                      })
                    }
                  >
                    <i
                      style={{
                        background: `linear-gradient(135deg,${theme.base} 52%,${theme.accent} 52%)`,
                      }}
                    />
                    <span>
                      <strong>{theme.name}</strong>
                      <small>{theme.hint}</small>
                    </span>
                  </button>
                ))}
              </div>
            </Stack>

            <Stack title="Helligkeit" meta="Die sechs Farbwelten bleiben erhalten.">
              <div className="segmented-control">
                {(['system', 'light', 'dark'] as ThemeMode[]).map(item => (
                  <button
                    key={item}
                    className={preferences.themeMode === item ? 'is-active' : ''}
                    onClick={() =>
                      void patchPreferences(draft => {
                        draft.themeMode = item;
                      })
                    }
                  >
                    {item}
                  </button>
                ))}
              </div>
            </Stack>

            <Row title="App-Schriftgroesse">
              <select
                value={preferences.fontSize}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.fontSize = event.target.value as typeof preferences.fontSize;
                  })
                }
              >
                {['small', 'normal', 'large', 'xlarge'].map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Row>

            <Row title="Arabische Schrift">
              <select
                value={preferences.arabicFont}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.arabicFont = event.target.value as ArabicFontPreference;
                  })
                }
              >
                {FONTS.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Row>

            <Row title="Arabische Schriftgroesse">
              <select
                value={preferences.arabicFontSize}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.arabicFontSize = event.target.value as typeof preferences.arabicFontSize;
                  })
                }
              >
                {['small', 'normal', 'large', 'xlarge'].map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Row>

            <Row title="Harakat">
              <select
                value={preferences.harakat}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.harakat = event.target.value as HarakatPreference;
                  })
                }
              >
                {HARAKAT.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Row>

            <Stack title="Harakat je Bereich" meta="inherit folgt der globalen Einstellung">
              <div className="module-harakat-grid">
                {HARAKAT_MODULES.map(item => (
                  <label key={item.id}>
                    <span>{item.label}</span>
                    <select
                      value={preferences.moduleHarakat[item.id]}
                      onChange={event =>
                        void patchPreferences(draft => {
                          draft.moduleHarakat[item.id] = event.target.value as HarakatOverride;
                        })
                      }
                    >
                      {['inherit', 'show', 'hide'].map(value => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </Stack>

            <Toggle
              label="Transliteration"
              checked={preferences.transliteration}
              onChange={value =>
                void patchPreferences(draft => {
                  draft.transliteration = value;
                })
              }
            />
            <Toggle
              label="Hoher Kontrast"
              checked={preferences.highContrast}
              onChange={value =>
                void patchPreferences(draft => {
                  draft.highContrast = value;
                })
              }
            />
            <Toggle
              label="Animationen reduzieren"
              checked={preferences.reducedMotion}
              onChange={value =>
                void patchPreferences(draft => {
                  draft.reducedMotion = value;
                })
              }
            />
          </Surface>

          <Surface className="settings-card">
            <Heading eyebrow="Lernen" title="Lernziel und Pfade" />
            <Stack
              title="Lernhilfe"
              meta="Detailliert zeigt zusaetzliche Erklaerungen und Hinweise."
            >
              <div className="segmented-control">
                {(['standard', 'detailed'] as const).map(item => (
                  <button
                    key={item}
                    className={preferences.learningHelp === item ? 'is-active' : ''}
                    onClick={() =>
                      void patchPreferences(draft => {
                        draft.learningHelp = item;
                      })
                    }
                  >
                    {item === 'standard' ? 'Standard' : 'Detailliert'}
                  </button>
                ))}
              </div>
            </Stack>

            <Row
              title="Persoenlichen Lernplan neu einrichten"
              meta="Ziel, Startpunkt, Tageszeit und Einstufung erneut festlegen"
            >
              <button
                className="button button--secondary"
                onClick={() =>
                  void patchPreferences(draft => {
                    draft.onboardingComplete = false;
                    draft.onboardingVersion = 0;
                  })
                }
              >
                <Icon name="target" size={17} /> Neu einrichten
              </button>
            </Row>

            <Row title="Aktuelles Niveau" meta="Filter fuer freie Uebungen">
              <select
                value={preferences.currentLevel}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.currentLevel = event.target.value as CefrLevel;
                  })
                }
              >
                {LEVELS.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Row>

            <Row title="Zielniveau">
              <select
                value={preferences.targetLevel}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.targetLevel = event.target.value as CefrLevel;
                  })
                }
              >
                {LEVELS.map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Row>

            <Stack title="Tagesziel" meta={`${preferences.dailyGoalMinutes} Minuten`}>
              <input
                className="range"
                type="range"
                min="5"
                max="180"
                step="5"
                value={preferences.dailyGoalMinutes}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.dailyGoalMinutes = Number(event.target.value);
                  })
                }
              />
            </Stack>

            <Stack title="Aktive Lernpfade" meta="Steuert Startseite und Fortschritt">
              <div className="track-setting-grid">
                {TRACKS.map(track => (
                  <button
                    key={track}
                    className={preferences.enabledTracks.includes(track) ? 'is-active' : ''}
                    onClick={() => void toggleTrack(track)}
                  >
                    {courseTrackLabel(track)}
                  </button>
                ))}
              </div>
            </Stack>

            <Row title="Primaere Fiqh-Schule">
              <select
                value={preferences.primaryFiqhSchool}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.primaryFiqhSchool = event.target.value as typeof preferences.primaryFiqhSchool;
                  })
                }
              >
                {['hanafi', 'maliki', 'shafii', 'hanbali'].map(item => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Row>
          </Surface>

          <Surface className="settings-card">
            <Heading eyebrow="Audio" title="Aussprache und Quran" />
            <Toggle
              label="Audio aktiviert"
              checked={preferences.audioEnabled}
              onChange={value =>
                void patchPreferences(draft => {
                  draft.audioEnabled = value;
                })
              }
            />

            <Row title="Sprechtempo">
              <select
                value={preferences.audioRate}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.audioRate = Number(event.target.value) as typeof preferences.audioRate;
                  })
                }
              >
                {[0.75, 1, 1.25].map(item => (
                  <option key={item} value={item}>
                    {item}x
                  </option>
                ))}
              </select>
            </Row>

            <Row title="Arabische Stimme">
              <select
                value={preferences.audioVoice}
                onChange={event =>
                  void patchPreferences(draft => {
                    draft.audioVoice = event.target.value;
                  })
                }
              >
                <option value="">Automatisch</option>
                {voices.map(item => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.lang})
                  </option>
                ))}
              </select>
            </Row>

            <div className="offline-box">
              <div>
                <strong>Offline-Status</strong>
                <span>
                  {offline
                    ? `${offline.bundledDatasets} Datensaetze - ${offline.audioCachedFiles} Audio - ${formatBytes(offline.audioCachedBytes)}`
                    : 'Wird gelesen...'}
                </span>
              </div>
              <div>
                <input
                  type="number"
                  min="1"
                  max="114"
                  value={offlineSurah}
                  onChange={event =>
                    setOfflineSurah(Math.max(1, Math.min(114, Number(event.target.value))))
                  }
                />
                <button className="button button--secondary" onClick={() => void cacheSurah()}>
                  Sure offline
                </button>
                <button className="button button--secondary" onClick={() => void clearAudio()}>
                  Audio leeren
                </button>
              </div>
            </div>
          </Surface>

          <Surface className="settings-card">
            <Heading eyebrow="Daten" title="Backup und Reset" />
            <Row title="Backup exportieren" meta="Profil, Fortschritt, Reviews und Notizen">
              <button className="button button--secondary" onClick={() => void backup()}>
                <Icon name="download" size={18} /> Export
              </button>
            </Row>
            <Row title="Backup importieren" meta="Import wird als Profil angelegt">
              <label className="button button--secondary">
                Import
                <input
                  className="file-input-hidden"
                  type="file"
                  accept="application/json,.json"
                  onChange={event => void restore(event)}
                />
              </label>
            </Row>
            <Toggle
              label="Recovery-Snapshots"
              checked={preferences.autoRecoverySnapshots}
              onChange={value =>
                void patchPreferences(draft => {
                  draft.autoRecoverySnapshots = value;
                })
              }
            />
            <Row title="Lernfortschritt zuruecksetzen">
              <button
                className="button button--ghost-danger"
                onClick={() => {
                  if (confirm('Lernfortschritt wirklich zuruecksetzen?')) void reset('learning');
                }}
              >
                Zuruecksetzen
              </button>
            </Row>
            <Row title="Profil loeschen">
              <button
                className="button button--ghost-danger"
                onClick={() => {
                  if (confirm('Profil wirklich loeschen?')) void deleteCurrentProfile();
                }}
              >
                <Icon name="trash" size={17} /> Loeschen
              </button>
            </Row>
          </Surface>
        </div>
      </div>
    </StudyUtilityFrame>
  );
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="settings-card__heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
    </div>
  );
}

function Row({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        {meta && <span>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

function Stack({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row setting-row--stack">
      <div>
        <strong>{title}</strong>
        {meta && <span>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="setting-row setting-row--toggle">
      <div>
        <strong>{label}</strong>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      <span className="switch" />
    </label>
  );
}
