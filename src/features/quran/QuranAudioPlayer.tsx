'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuranReaderAudioRecord } from '../../types/models';
import { useAppPreferences } from '../../state/AppProvider';
import { resolveQuranAudioPlayback } from '../../services/audio/quran-audio-cache';
import { speakArabic, stopSpeech } from '../../services/audio/audio-service';
import { Icon } from '../../components/ui/Icon';

interface Props {
  reference: string;
  ayahText?: string;
  audio?: QuranReaderAudioRecord;
}

export function QuranAudioPlayer({ reference, ayahText, audio }: Props) {
  const { preferences, patchPreferences } = useAppPreferences();
  const [player, setPlayer] = useState({ playing: false, current: 0, duration: 0 });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackRevoke = useRef<(() => void) | null>(null);

  const stopPlayback = useCallback((resetPlayer = true) => {
    audioRef.current?.pause();
    audioRef.current = null;
    playbackRevoke.current?.();
    playbackRevoke.current = null;
    stopSpeech();
    if (resetPlayer) setPlayer({ playing: false, current: 0, duration: 0 });
  }, []);

  useEffect(() => {
    stopPlayback();
  }, [reference, stopPlayback]);

  useEffect(() => () => stopPlayback(false), [stopPlayback]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = preferences.audioRate;
  }, [preferences.audioRate]);

  async function toggleAudio() {
    if (!ayahText || !preferences.audioEnabled) return;
    const existing = audioRef.current;
    if (existing) {
      if (existing.paused) await existing.play();
      else existing.pause();
      return;
    }

    if (!audio) {
      speakArabic(ayahText, preferences.audioRate, {
        onStart: () => setPlayer((value) => ({ ...value, playing: true })),
        onEnd: () => setPlayer({ playing: false, current: 0, duration: 0 }),
        onError: () => setPlayer({ playing: false, current: 0, duration: 0 })
      }, preferences.audioVoice);
      return;
    }

    const resolved = await resolveQuranAudioPlayback(audio.audioPath);
    playbackRevoke.current?.();
    playbackRevoke.current = resolved.revoke;
    const element = new Audio(resolved.url);
    element.playbackRate = preferences.audioRate;
    element.addEventListener('play', () => setPlayer((value) => ({ ...value, playing: true })));
    element.addEventListener('pause', () => setPlayer((value) => ({ ...value, playing: false })));
    element.addEventListener('timeupdate', () => {
      setPlayer({
        playing: !element.paused,
        current: element.currentTime,
        duration: Number.isFinite(element.duration) ? element.duration : 0
      });
    });
    element.addEventListener('loadedmetadata', () => {
      setPlayer((value) => ({ ...value, duration: Number.isFinite(element.duration) ? element.duration : 0 }));
    });
    element.addEventListener('ended', () => setPlayer((value) => ({ ...value, playing: false, current: 0 })));
    audioRef.current = element;
    await element.play();
  }

  return <section className="quran-study-player">
    <button
      className="player-button"
      disabled={!preferences.audioEnabled}
      onClick={() => void toggleAudio()}
      aria-label={preferences.audioEnabled ? 'Audio abspielen' : 'Audio ist deaktiviert'}
    >
      <Icon name={player.playing ? 'pause' : 'play'} size={18} />
    </button>
    <div>
      <strong>{audio?.qari ?? 'Quran Rezitation'}</strong>
      <span>{preferences.audioEnabled ? (audio?.label ?? 'Audio / TTS Fallback') : 'Audio deaktiviert'}</span>
    </div>
    <span>{formatTime(player.current)}</span>
    <i><em style={{ width: `${player.duration ? Math.min(100, player.current / player.duration * 100) : 0}%` }} /></i>
    <span>{formatTime(player.duration)}</span>
    <select
      value={preferences.audioRate}
      onChange={(event) => void patchPreferences((draft) => {
        draft.audioRate = Number(event.target.value) as typeof draft.audioRate;
      })}
    >
      <option value="0.75">0.75x</option>
      <option value="1">1.0x</option>
      <option value="1.25">1.25x</option>
    </select>
  </section>;
}

function formatTime(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const min = Math.floor(safe / 60);
  const sec = Math.floor(safe % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
