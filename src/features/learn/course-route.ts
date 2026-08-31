import type { CourseTrack } from '../../types/models';
import { href, ROUTES } from '../../components/shell/routes';

export function courseHomeHref(track: CourseTrack): string {
  if (track === 'fusha') return ROUTES.learn;
  if (track === 'quran') return href(ROUTES.quran, { mode: 'verstehen' });
  return href(ROUTES.knowledge, { track });
}
