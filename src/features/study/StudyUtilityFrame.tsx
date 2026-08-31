'use client';

import type { ReactNode } from 'react';

export type StudyUtilityArea = 'today' | 'library' | 'progress' | 'settings' | 'sources' | 'domain';

export function StudyUtilityFrame({ children }: { active: StudyUtilityArea; children: ReactNode }) {
  return <div className="study-utility-workspace study-utility-workspace--nur"><main className="study-utility-main">{children}</main></div>;
}
