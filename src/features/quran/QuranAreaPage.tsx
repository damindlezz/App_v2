'use client';
import { useEffect, useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { CoursePathView } from '../learn/CoursePathView';
import { QuranReader } from './QuranReader';

type Mode='lesen'|'verstehen';

export function QuranAreaPage(){
  const [mode,setMode]=useState<Mode|null>(null);
  useEffect(()=>{const value=new URLSearchParams(location.search).get('mode');setMode(value==='verstehen'?'verstehen':'lesen');},[]);
  if(!mode)return <div className="state-page"><Icon name="book" size={28}/><p>Quran-Bereich wird geladen.</p></div>;
  if(mode==='verstehen')return <CoursePathView track="quran" eyebrow="Quran verstehen" title="Von Schrift bis Sprachverständnis" description="Von sicherem Lesen über Quran-Wortschatz und Wortanalyse bis zu quranischer Grammatik und eigenständigem Sprachverständnis." showQuranRoadmap/>;
  return <QuranReader/>;
}
