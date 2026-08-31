'use client';
import { useMemo } from 'react';
import type { CourseTrack } from '../../types/models';
import { buildCoursePathModel } from '../../shared/learning-path';
import { useAppContent, useAppLearning, useAppProgress } from '../../state/AppProvider';
import { StudyWorkspace, type StudyCompetency } from '../study/StudyWorkspace';
import { courseHomeHref } from './course-route';

interface Props {
  track: CourseTrack;
  eyebrow: string;
  title: string;
  description: string;
  showArabicRoadmap?: boolean;
  showQuranRoadmap?: boolean;
  backLabel?: string;
  onBack?: () => void;
}

// Sichtbarer Kompetenzkorridor des Arabisch-Pfads: 0 bis C2.
const ARABIC_COMPETENCIES: readonly StudyCompetency[] = [
  {title:'Alphabet',text:'Schrift sicher erkennen und verbinden'},
  {title:'Lesen',text:'Vokalisierte und später unvokalisierte Texte lesen'},
  {title:'Wortschatz',text:'Alltags- und Bildungswortschatz systematisch aufbauen'},
  {title:'Grammatik',text:'Formen, Fälle, Verben und Satzstrukturen verstehen'},
  {title:'Satzbau',text:'Eigene Sätze bilden und komplexe Strukturen analysieren'},
  {title:'Hörverstehen',text:'Laute, Wörter und zusammenhängende Sprache erfassen'}
];

// Quran-Kompetenzkorridor Q0–Q6. Arabisch-Brücken bleiben als prerequisites im Ledger sichtbar.
const QURAN_COMPETENCIES: readonly StudyCompetency[] = [
  {code:'Q0',title:'Schrift',text:'Mushaf-Schrift und Zeichen sicher lesen'},
  {code:'Q1',title:'Lesefluss',text:'Ayat verbunden und sicher lesen'},
  {code:'Q2',title:'Tajwid',text:'Grundregeln erkennen und anwenden'},
  {code:'Q3',title:'Rezitation',text:'Verbundene Rezitation kontrolliert ausführen'},
  {code:'Q4',title:'Analyse',text:'Vom Lesen zur sprachlichen Analyse wechseln'},
  {code:'Q5',title:'Wortschatz',text:'Häufige Quran-Wörter, Wurzeln und Wortfamilien erkennen'},
  {code:'Q6',title:'Grammatik',text:'Nominal-, Verbal- und Referenzstrukturen in Ayat verstehen'}
];

const KNOWLEDGE_COMPETENCIES: readonly StudyCompetency[] = [
  {code:'S0',title:'Grundlagen',text:'Begriffe, Quellen und methodische Basis'},
  {code:'S1',title:'Aufbau',text:'Kernfragen des Fachgebiets systematisch bearbeiten'},
  {code:'S2',title:'Anwendung',text:'Fälle, Belege und fachliche Zusammenhänge einordnen'},
  {code:'S3',title:'Vertiefung',text:'Methodisch vergleichen, begründen und transferieren'}
];

export function CoursePathView({track,eyebrow,title,description,showArabicRoadmap=false,showQuranRoadmap=false,backLabel,onBack}:Props){
  const { content } = useAppContent();
const { progress } = useAppProgress();
const { contentProgress, reviewSummary } = useAppLearning();
  const models=useMemo(()=>content?{
    primary:buildCoursePathModel(content,progress,contentProgress,reviewSummary,track),
    fusha:showQuranRoadmap?buildCoursePathModel(content,progress,contentProgress,reviewSummary,'fusha'):null
  }:null,[content,contentProgress,progress,reviewSummary,showQuranRoadmap,track]);
  if(!content||!models?.primary)return null;
  const competencies=showArabicRoadmap?ARABIC_COMPETENCIES:showQuranRoadmap?QURAN_COMPETENCIES:KNOWLEDGE_COMPETENCIES;
  return <StudyWorkspace
    track={track}
    model={models.primary}
    fushaModel={models.fusha}
    eyebrow={eyebrow}
    title={title}
    description={description}
    competencies={competencies}
    backLabel={backLabel}
    onBack={onBack}
  />;
}

export { courseHomeHref };
