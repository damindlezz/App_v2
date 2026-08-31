'use client';

import type { CSSProperties } from 'react';

const LETTERS = [
  ['ن','8%',26,31,'0s','.055'],['ق','18%',38,39,'-14s','.05'],['ع','31%',30,35,'-8s','.045'],
  ['ر','47%',36,42,'-21s','.05'],['ح','62%',28,34,'-5s','.05'],['ك','76%',42,46,'-18s','.04'],['م','90%',31,37,'-11s','.05']
] as const;

export function NurAmbient(){
  return <div className="nur-ambient" aria-hidden="true">
    <div className="nur-girih"/><div className="nur-noise"/>
    {LETTERS.map(([letter,left,size,duration,delay,opacity],index)=><span key={`${letter}:${index}`} className="nur-float-letter" style={{left,fontSize:`${size}px`,animationDuration:`${duration}s`,animationDelay:delay,'--nur-float-opacity':opacity} as CSSProperties}>{letter}</span>)}
  </div>;
}
