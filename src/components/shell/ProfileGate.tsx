'use client';

import { useState } from 'react';
import { AVATARS } from '../../core/defaults';
import { useAppProfile, useAppRuntime } from '../../state/AppProvider';
import { Icon } from '../ui/Icon';

export function ProfileGate() {
  const { profiles, createProfile, openProfile } = useAppProfile();
  const { busy, error } = useAppRuntime();
  const [creating, setCreating] = useState(profiles.length === 0);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [pin, setPin] = useState('');

  async function create() {
    if (!name.trim()) return;
    await createProfile({
      name: name.trim(),
      avatar,
      pin: pin.trim() || undefined,
    });
  }

  return (
    <div className="gate">
      <section className="gate-card">
        <div className="gate-brand">
          <span className="gate-logo">✦</span>
          <div>
            <strong>NŪR</strong>
            <small>Quran-Akademie · نُور</small>
          </div>
        </div>

        {!creating && profiles.length ? (
          <>
            <div className="gate-heading">
              <span>Profil wählen</span>
              <h1>Weiterlernen</h1>
            </div>
            <div className="profile-list">
              {profiles.map(profile => (
                <button key={profile.id} onClick={() => void openProfile(profile.id)}>
                  <span>{profile.avatar}</span>
                  <div>
                    <strong>{profile.name}</strong>
                    <small>
                      {profile.currentLevel} → {profile.targetLevel} · {Math.round(profile.progressPercent)}%
                    </small>
                  </div>
                  <Icon name="arrow" size={18} />
                </button>
              ))}
            </div>
            <button className="button button--ghost gate-new" onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} /> Neues Profil
            </button>
          </>
        ) : (
          <>
            <div className="gate-heading">
              <span>Lokales Profil</span>
              <h1>Deinen Lernraum einrichten</h1>
            </div>
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={event => setName(event.target.value)} placeholder="Name" autoFocus />
            </label>
            <div className="avatar-picker">
              {AVATARS.map(item => (
                <button key={item} className={avatar === item ? 'is-active' : ''} onClick={() => setAvatar(item)}>
                  {item}
                </button>
              ))}
            </div>
            <label className="field">
              <span>PIN optional</span>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={event => setPin(event.target.value)}
                placeholder="Nur auf diesem Gerät"
              />
            </label>
            {error && <p className="inline-error">{error}</p>}
            <button className="button button--primary button--wide" disabled={busy || !name.trim()} onClick={() => void create()}>
              Profil erstellen
            </button>
            {profiles.length > 0 && (
              <button className="button button--ghost button--wide" onClick={() => setCreating(false)}>
                Zurück
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
