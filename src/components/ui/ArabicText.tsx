'use client';

import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import type { HarakatModule, HarakatOverride, HarakatPreference } from '../../types/models';
import { useAppPreferences } from '../../state/AppProvider';

const ARABIC_MARKS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;

export function stripArabicMarks(value: string): string {
  return value.replace(ARABIC_MARKS, '');
}

export function resolveArabicText(value: string, preference: HarakatPreference, override: HarakatOverride = 'inherit'): string {
  const mode = override === 'inherit' ? preference : override;
  return mode === 'hide' ? stripArabicMarks(value) : value;
}

interface ArabicTextProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  text: string;
  module?: HarakatModule;
  as?: ElementType;
}

export function ArabicText({ text, module = 'quran', as: Tag = 'span', className = '', ...props }: ArabicTextProps) {
  const { preferences } = useAppPreferences();
  const override = preferences.moduleHarakat[module] ?? 'inherit';
  const value = resolveArabicText(text, preferences.harakat, override);
  return <Tag {...props} dir="rtl" className={`arabic-text ${className}`.trim()}>{value}</Tag>;
}

export function Transliteration({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { preferences } = useAppPreferences();
  if (!preferences.transliteration) return null;
  return <span className={`transliteration ${className}`.trim()}>{children}</span>;
}
