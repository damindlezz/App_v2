export type DailyImpulseType = 'quran' | 'hadith';

export interface DailyImpulse {
  id: string;
  type: DailyImpulseType;
  arabic: string;
  translation: string;
  source: string;
  topic: 'wissen' | 'bestaendigkeit' | 'geduld' | 'ruhe' | 'quran' | 'absicht';
  excerpt?: boolean;
  grade?: 'Sahih';
}

// 7 Quran-Impulse + 3 Hadithe = 70/30-Grundverteilung
export const DAILY_IMPULSES: readonly DailyImpulse[] = [
  {
    id: 'quran-20-114',
    type: 'quran',
    arabic: 'وَقُلْ رَبِّ زِدْنِي عِلْمًا',
    translation: 'Und sage: Mein Herr, mehre mein Wissen.',
    source: 'Quran 20:114',
    topic: 'wissen',
    excerpt: true
  },
  {
    id: 'quran-94-6',
    type: 'quran',
    arabic: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا',
    translation: 'Mit der Erschwernis ist Erleichterung.',
    source: 'Quran 94:6',
    topic: 'geduld'
  },
  {
    id: 'quran-39-9',
    type: 'quran',
    arabic: 'هَلْ يَسْتَوِي الَّذِينَ يَعْلَمُونَ وَالَّذِينَ لَا يَعْلَمُونَ',
    translation: 'Sind diejenigen, die wissen, denen gleich, die nicht wissen?',
    source: 'Quran 39:9',
    topic: 'wissen',
    excerpt: true
  },
  {
    id: 'quran-58-11',
    type: 'quran',
    arabic: 'يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ',
    translation: 'Allah erhöht die Glaubenden und die mit Wissen Beschenkten um Rangstufen.',
    source: 'Quran 58:11',
    topic: 'wissen',
    excerpt: true
  },
  {
    id: 'quran-13-28',
    type: 'quran',
    arabic: 'أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ',
    translation: 'Im Gedenken Allahs finden die Herzen Ruhe.',
    source: 'Quran 13:28',
    topic: 'ruhe',
    excerpt: true
  },
  {
    id: 'quran-29-69',
    type: 'quran',
    arabic: 'وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا',
    translation: 'Wer sich aufrichtig bemüht, dem zeigen Wir Unsere Wege.',
    source: 'Quran 29:69',
    topic: 'bestaendigkeit',
    excerpt: true
  },
  {
    id: 'quran-2-286',
    type: 'quran',
    arabic: 'لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا',
    translation: 'Allah belastet keine Seele über ihr Vermögen hinaus.',
    source: 'Quran 2:286',
    topic: 'geduld',
    excerpt: true
  },
  {
    id: 'hadith-bukhari-5027',
    type: 'hadith',
    arabic: 'خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ',
    translation: 'Zu den Besten gehören jene, die den Quran lernen und ihn lehren.',
    source: 'Sahih al-Bukhari 5027',
    topic: 'quran',
    grade: 'Sahih'
  },
  {
    id: 'hadith-muslim-2699a',
    type: 'hadith',
    arabic: 'وَمَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ',
    translation: 'Wer einen Weg auf der Suche nach Wissen geht, dem erleichtert Allah dadurch einen Weg zum Paradies.',
    source: 'Sahih Muslim 2699a',
    topic: 'wissen',
    grade: 'Sahih'
  },
  {
    id: 'hadith-bukhari-6464',
    type: 'hadith',
    arabic: 'وَأَنَّ أَحَبَّ الْأَعْمَالِ أَدْوَمُهَا إِلَى اللَّهِ، وَإِنْ قَلَّ',
    translation: 'Zu den liebsten Taten bei Allah gehören die beständigen, auch wenn sie klein sind.',
    source: 'Sahih al-Bukhari 6464',
    topic: 'bestaendigkeit',
    grade: 'Sahih',
    excerpt: true
  }
] as const;

export function impulseDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chooseFromSeed(seed: string, excludedIds: readonly string[]): DailyImpulse {
  const excluded = new Set(excludedIds);
  const start = hashString(seed) % DAILY_IMPULSES.length;
  for (let offset = 0; offset < DAILY_IMPULSES.length; offset += 1) {
    const candidate = DAILY_IMPULSES[(start + offset * 7) % DAILY_IMPULSES.length]!;
    if (!excluded.has(candidate.id)) return candidate;
  }
  return DAILY_IMPULSES[start]!;
}

export function getDailyImpulseById(id: string | null | undefined): DailyImpulse | null {
  if (!id) return null;
  return DAILY_IMPULSES.find((entry) => entry.id === id) ?? null;
}

export function selectDailyImpulse(profileId: string, date = new Date(), recentIds: readonly string[] = []): DailyImpulse {
  const day = impulseDayKey(date);
  return chooseFromSeed(`${profileId}:${day}:daily`, recentIds.slice(0, 3));
}

export function selectAlternativeImpulse(
  currentId: string,
  profileId: string,
  date = new Date(),
  recentIds: readonly string[] = []
): DailyImpulse {
  const day = impulseDayKey(date);
  return chooseFromSeed(`${profileId}:${day}:${currentId}:alternative`, [currentId, ...recentIds.slice(0, 4)]);
}
