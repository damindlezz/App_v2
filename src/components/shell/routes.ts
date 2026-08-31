export const ROUTES = {
  today: '/',
  learn: '/lernen/',
  quran: '/quran/',
  hifz: '/hifz/',
  knowledge: '/wissen/',
  review: '/wiederholen/',
  practice: '/ueben/',
  library: '/bibliothek/',
  progress: '/fortschritt/',
  settings: '/einstellungen/',
  module: '/modul/',
  domain: '/bereich/',
  sources: '/quellen/'
} as const;

export function href(path: string, params: Record<string, string | number | undefined | null> = {}): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `${path}?${query}` : path;
}
