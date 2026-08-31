'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CourseTrack } from '../../types/models';
import { courseTrackLabel, fiqhTrackForSchool, ISLAMIC_STUDY_TRACKS, isIslamicStudyTrack } from '../../shared/course-track-meta';
import { useAppContent, useAppProgress } from '../../state/AppProvider';
import { href, ROUTES } from '../../components/shell/routes';
import { Icon } from '../../components/ui/Icon';
import { CoursePathView } from '../learn/CoursePathView';

type IslamicTrack=Exclude<CourseTrack,'fusha'|'quran'>;

// Die Wissensarchitektur umfasst: Fiqh (Ḥanafī, Mālikī, Šāfiʿī, Ḥanbalī),
// Usul al-Fiqh, Hadith und Usul al-Hadith. Alle verwenden Studienstufen S0–S3,
// Kompetenz-Gates, Quellenbezug und getrennten Fortschritt.
export function KnowledgePage(){
  const router=useRouter();
  const { progress } = useAppProgress();
const { ensureIslamicTrack } = useAppContent();
  const [track,setTrack]=useState<IslamicTrack|null>(null);

  useEffect(()=>{
    const query=new URLSearchParams(location.search).get('track');
    const initial=query&&isIslamicStudyTrack(query as CourseTrack)
      ? query as IslamicTrack
      : fiqhTrackForSchool(progress.preferences.primaryFiqhSchool) as IslamicTrack;
    setTrack(initial);
    if(!query)router.replace(href(ROUTES.knowledge,{track:initial}),{scroll:false});
    void ensureIslamicTrack(initial).catch(()=>undefined);
  },[ensureIslamicTrack,progress.preferences.primaryFiqhSchool,router]);

  useEffect(()=>{if(track&&ISLAMIC_STUDY_TRACKS.includes(track))void ensureIslamicTrack(track).catch(()=>undefined);},[ensureIslamicTrack,track]);

  if(!track)return <div className="state-page"><Icon name="compass" size={28}/><p>Islamische Wissenschaften werden geladen.</p></div>;
  return <CoursePathView track={track} eyebrow="Islamische Wissenschaften" title={courseTrackLabel(track)} description="Strukturierter Fachpfad mit Studienstufen, Lernmodulen, Quellenbezug und verbindlichen Kompetenz-Gates."/>;
}
