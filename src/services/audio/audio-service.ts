import type { AudioRate } from '../../types/models';

export interface SpeechPlaybackEvents {
  onStart?(): void;
  onEnd?(): void;
  onError?(): void;
}

export interface ArabicVoiceOption {
  name: string;
  lang: string;
  local: boolean;
  preferred: boolean;
}

export interface RecordingSession {
  stop(): Promise<{ blob: Blob; url: string; durationMs: number }>;
  cancel(): void;
}

function availableVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  return speechSynthesis.getVoices();
}

function isArabicVoice(voice: SpeechSynthesisVoice): boolean {
  return /^ar(?:-|_)/i.test(voice.lang) || voice.lang.toLowerCase().includes('arab');
}

export function listArabicVoices(): ArabicVoiceOption[] {
  return availableVoices()
    .filter(isArabicVoice)
    .map((voice) => ({ name: voice.name, lang: voice.lang, local: voice.localService, preferred: voice.default }))
    .sort((a, b) => Number(b.preferred) - Number(a.preferred) || Number(b.local) - Number(a.local) || a.name.localeCompare(b.name));
}

export function onVoicesChanged(listener: () => void): () => void {
  if (typeof speechSynthesis === 'undefined') return () => undefined;
  const handler = (): void => listener();
  speechSynthesis.addEventListener?.('voiceschanged', handler);
  return () => speechSynthesis.removeEventListener?.('voiceschanged', handler);
}

function arabicVoice(preferredName = ''): SpeechSynthesisVoice | null {
  const voices = availableVoices();
  if (preferredName) {
    const preferred = voices.find((voice) => voice.name === preferredName && isArabicVoice(voice));
    if (preferred) return preferred;
  }
  return voices.find((voice) => isArabicVoice(voice) && voice.default)
    ?? voices.find((voice) => isArabicVoice(voice) && voice.localService)
    ?? voices.find(isArabicVoice)
    ?? null;
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function speakArabic(text: string, rate: AudioRate = 1, events: SpeechPlaybackEvents = {}, preferredVoice = ''): boolean {
  if (!canSpeak() || !text.trim()) return false;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ar-SA';
  utterance.rate = rate;
  utterance.pitch = 1;
  const voice = arabicVoice(preferredVoice);
  if (voice) utterance.voice = voice;
  utterance.onstart = () => events.onStart?.();
  utterance.onend = () => events.onEnd?.();
  utterance.onerror = () => events.onError?.();
  speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeech(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

export function canRecord(): boolean {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined';
}

export async function startRecording(): Promise<RecordingSession> {
  if (!canRecord()) throw new Error('Audioaufnahme wird in dieser Umgebung nicht unterstützt.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  const startedAt = performance.now();
  let settled = false;
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  recorder.start();
  const release = (): void => stream.getTracks().forEach((track) => track.stop());

  return {
    stop: () => new Promise((resolve, reject) => {
      if (settled) { reject(new Error('Aufnahme wurde bereits beendet.')); return; }
      settled = true;
      recorder.addEventListener('stop', () => {
        release();
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        resolve({ blob, url: URL.createObjectURL(blob), durationMs: Math.max(0, performance.now() - startedAt) });
      }, { once: true });
      recorder.addEventListener('error', () => { release(); reject(new Error('Audioaufnahme ist fehlgeschlagen.')); }, { once: true });
      recorder.stop();
    }),
    cancel: () => {
      if (settled) return;
      settled = true;
      try { if (recorder.state !== 'inactive') recorder.stop(); } finally { release(); }
    }
  };
}

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionSession {
  stop(): Promise<SpeechRecognitionResult>;
  cancel(): void;
}

interface RecognitionAlternativeLike { transcript: string; confidence: number }
interface RecognitionResultLike { 0: RecognitionAlternativeLike; length: number }
interface RecognitionEventLike { resultIndex: number; results: ArrayLike<RecognitionResultLike> }
interface RecognitionErrorLike { error?: string }
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function canRecognizeArabic(): boolean {
  return Boolean(recognitionConstructor());
}

export function startArabicRecognition(): SpeechRecognitionSession | null {
  const Constructor = recognitionConstructor();
  if (!Constructor) return null;
  const recognition = new Constructor();
  recognition.lang = 'ar-SA';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  let transcript = '';
  let confidence = 0;
  let ended = false;
  let stopping = false;
  let resolveResult: ((result: SpeechRecognitionResult) => void) | null = null;
  let rejectResult: ((error: Error) => void) | null = null;
  const resultPromise = new Promise<SpeechRecognitionResult>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  recognition.onresult = (event) => {
    const alternative = event.results[event.resultIndex]?.[0];
    if (!alternative) return;
    transcript = alternative.transcript?.trim() ?? '';
    confidence = Number.isFinite(alternative.confidence) ? alternative.confidence : 0;
  };
  recognition.onerror = (event) => {
    if (event.error === 'aborted' && stopping) return;
    if (!ended) rejectResult?.(new Error(`Spracherkennung fehlgeschlagen: ${event.error ?? 'unbekannt'}`));
    ended = true;
  };
  recognition.onend = () => {
    if (ended) return;
    ended = true;
    resolveResult?.({ transcript, confidence });
  };
  recognition.start();
  return {
    stop: async () => {
      if (!ended) {
        stopping = true;
        recognition.stop();
      }
      return resultPromise;
    },
    cancel: () => {
      if (ended) return;
      stopping = true;
      recognition.abort();
      ended = true;
      resolveResult?.({ transcript: '', confidence: 0 });
    }
  };
}
