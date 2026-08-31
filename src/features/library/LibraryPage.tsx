'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HarakatModule, LearningContent } from '../../types/models';
import { useAppAnnotations, useAppContent, useAppProgress } from '../../state/AppProvider';
import { Icon } from '../../components/ui/Icon';
import { AnnotationTools } from '../../components/ui/AnnotationTools';
import { PageTitle, Surface } from '../../components/ui/Surface';
import { ArabicText, Transliteration } from '../../components/ui/ArabicText';
import { href, ROUTES } from '../../components/shell/routes';

type Domain = 'alphabet' | 'vocabulary' | 'grammar' | 'writing' | 'reading';
type Category = 'all' | Domain | 'quran' | 'source';

interface Item {
  id: string;
  category: Exclude<Category, 'all'>;
  title: string;
  subtitle: string;
  arabic?: string;
  level?: string;
  detail: string;
  searchText: string;
  isTransliteration?: boolean;
}

const DOMAINS: Array<{ id: Domain | 'quran' | 'sources'; title: string; subtitle: string; symbol: string }> = [
  { id: 'alphabet', title: 'Alphabet', subtitle: 'Buchstaben, Formen, Laute', symbol: 'A' },
  { id: 'vocabulary', title: 'Wortschatz', subtitle: 'Vokabeln, Wurzeln, Kontext', symbol: 'V' },
  { id: 'grammar', title: 'Grammatik', subtitle: 'Regeln, Beispiele, Fehler', symbol: 'G' },
  { id: 'writing', title: 'Schreiben', subtitle: 'Nachspuren und Produktion', symbol: 'W' },
  { id: 'reading', title: 'Lesen', subtitle: 'Muster und Harakat', symbol: 'L' },
  { id: 'quran', title: 'Quran', subtitle: 'Reader, Tajwid und Hifz', symbol: 'Q' },
  { id: 'sources', title: 'Quellen', subtitle: 'Nachweise und Claims', symbol: 'S' }
];

export function LibraryPage() {
  const { content, ensureVocabularyDetails, ensureSourceCatalog } = useAppContent();
  const { progress, patchProgress } = useAppProgress();
  const { userAnnotations } = useAppAnnotations();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [selected, setSelected] = useState<Item | null>(null);

  useEffect(() => {
    void ensureVocabularyDetails().catch(() => undefined);
    void ensureSourceCatalog().catch(() => undefined);
  }, [ensureSourceCatalog, ensureVocabularyDetails]);

  const items = useMemo(() => content ? makeItems(content) : [], [content]);
  const deferredQuery = useDeferredValue(query);
  const needle = deferredQuery.trim().toLocaleLowerCase('de');
  const filtered = useMemo(
    () => items
      .filter((item) => (category === 'all' || item.category === category)
        && (!needle || item.searchText.includes(needle)))
      .slice(0, 160),
    [items, category, needle]
  );

  useEffect(() => {
    if (!filtered.length) {
      if (selected) setSelected(null);
      return;
    }
    if (!selected || !filtered.some((item) => item.id === selected.id && item.category === selected.category)) {
      setSelected(filtered[0] ?? null);
    }
  }, [filtered, selected]);

  if (!content) return null;

  const favorites = useMemo(() => new Set(progress.libraryFavorites), [progress.libraryFavorites]);
  const byKey = useMemo(() => new Map(items.map((item) => [itemKey(item), item])), [items]);
  const recent = useMemo(
    () => progress.libraryRecent.map((key) => byKey.get(key)).filter(Boolean).slice(0, 6) as Item[],
    [byKey, progress.libraryRecent]
  );
  const saved = useMemo(
    () => progress.libraryFavorites.map((key) => byKey.get(key)).filter(Boolean).slice(0, 6) as Item[],
    [byKey, progress.libraryFavorites]
  );

  function openDomain(id: Domain | 'quran' | 'sources') {
    if (id === 'quran') router.push(ROUTES.quran);
    else if (id === 'sources') router.push(ROUTES.sources);
    else router.push(href(ROUTES.domain, { domain: id }));
  }

  async function open(item: Item) {
    const key = itemKey(item);
    await patchProgress((draft) => {
      draft.libraryRecent = [key, ...draft.libraryRecent.filter((value) => value !== key)].slice(0, 8);
    }, ['library']);

    if (item.category === 'source') router.push(href(ROUTES.sources, { id: item.id }));
    else if (item.category === 'quran') router.push(href(ROUTES.quran, { mode: 'verstehen' }));
    else router.push(href(ROUTES.domain, { domain: item.category, id: item.id }));
  }

  async function toggle(item: Item) {
    const key = itemKey(item);
    await patchProgress((draft) => {
      draft.libraryFavorites = draft.libraryFavorites.includes(key)
        ? draft.libraryFavorites.filter((value) => value !== key)
        : [key, ...draft.libraryFavorites].slice(0, 150);
    }, ['library']);
  }

  return (
    <div className="standard-page library-page">
      <PageTitle
        eyebrow="Bibliothek"
        title="Lerninhalte und Quellen"
        description="Ein Einstieg fuer Inhalte, persoenliche Favoriten und Nachweise."
      />

      <div className="library-domain-grid">
        {DOMAINS.map((item) => (
          <button key={item.id} onClick={() => openDomain(item.id)}>
            <span>{item.symbol}</span>
            <div><strong>{item.title}</strong><small>{item.subtitle}</small></div>
            <Icon name="arrow" size={16}/>
          </button>
        ))}
      </div>

      <div className="saved-grid">
        <Surface>
          <span className="section-eyebrow">Zuletzt angesehen</span>
          <Saved items={recent} empty="Noch keine Inhalte geoeffnet." onOpen={open}/>
        </Surface>
        <Surface>
          <span className="section-eyebrow">Favoriten</span>
          <Saved items={saved} empty="Noch keine Favoriten." onOpen={open}/>
        </Surface>
        <Surface>
          <span className="section-eyebrow">Notizen & Lesezeichen</span>
          <div className="annotation-list">
            {userAnnotations.slice(0, 8).map((item) => (
              <button
                key={`${item.entityType}:${item.entityId}:${item.annotationType}`}
                onClick={() => item.entityType === 'quran_ayah'
                  ? router.push(href(ROUTES.quran, { ref: item.entityId }))
                  : item.entityType === 'source'
                    ? router.push(href(ROUTES.sources, { id: item.entityId }))
                    : undefined}
              >
                <Icon name={item.annotationType === 'bookmark' ? 'bookmark' : 'pen'} size={15}/>
                <span><strong>{item.entityId}</strong><small>{item.text || item.entityType}</small></span>
              </button>
            ))}
          </div>
        </Surface>
      </div>

      <div className="library-toolbar">
        <label className="search-box">
          <Icon name="search" size={18}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Arabisch, Deutsch, Thema oder Quelle"/>
        </label>
        <div className="filter-chips">
          {(['all', 'vocabulary', 'grammar', 'alphabet', 'writing', 'reading', 'quran', 'source'] as Category[]).map((value) => (
            <button key={value} className={category === value ? 'is-active' : ''} onClick={() => setCategory(value)}>{label(value)}</button>
          ))}
        </div>
      </div>

      <div className={`library-layout ${selected ? 'has-detail' : ''}`}>
        <div className="library-list">
          <div className="library-list__meta"><strong>{filtered.length}</strong><span>Treffer</span></div>
          {filtered.map((item) => (
            <button
              className={selected?.id === item.id && selected.category === item.category ? 'is-active' : ''}
              key={`${item.category}:${item.id}`}
              onClick={() => setSelected(item)}
            >
              <span className="library-row__type">{symbol(item.category)}</span>
              <div>
                {item.arabic && <ArabicText className="library-arabic" module={arabicModule(item.category)} text={item.arabic}/>} 
                <strong>{item.title}</strong>
                <small>{item.isTransliteration ? <Transliteration>{item.subtitle}</Transliteration> : item.subtitle}</small>
              </div>
              <span>{item.level}</span>
              <Icon name="chevron" size={16}/>
            </button>
          ))}
        </div>

        {selected && (
          <aside className="library-detail">
            <button className="icon-button close-detail" onClick={() => setSelected(null)}><Icon name="close" size={17}/></button>
            <div className="detail-top">
              <span className="pill">{label(selected.category)} {selected.level}</span>
              <AnnotationTools entityType={selected.category === 'source' ? 'source' : 'learning_item'} entityId={selected.id} compact/>
            </div>
            {selected.arabic && <ArabicText as="div" className="library-detail__arabic" module={arabicModule(selected.category)} text={selected.arabic}/>} 
            <h2>{selected.title}</h2>
            <p>{selected.isTransliteration ? <Transliteration>{selected.subtitle}</Transliteration> : selected.subtitle}</p>
            <pre>{selected.detail}</pre>
            <div className="detail-actions">
              <button className="button button--primary" onClick={() => void open(selected)}>Oeffnen</button>
              <button className="button button--secondary" onClick={() => void toggle(selected)}>
                <Icon name="star" size={17}/>{favorites.has(itemKey(selected)) ? 'Favorit entfernen' : 'Favorit'}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function makeItems(content: LearningContent): Item[] {
  const items: Array<Omit<Item, 'searchText'>> = [
    ...content.vocabulary.map((item) => ({
      id: item.id,
      category: 'vocabulary' as const,
      title: item.german,
      subtitle: item.transliteration,
      arabic: item.arabicVocalized,
      level: item.cefrLevel,
      isTransliteration: true,
      detail: [
        item.translationNote,
        item.root && `Wurzel: ${item.root}`,
        ...item.examples.map((example) => `${example.arabicVocalized} - ${example.german}`)
      ].filter(Boolean).join('\n')
    })),
    ...content.grammar.map((item) => ({
      id: item.id,
      category: 'grammar' as const,
      title: item.title,
      subtitle: item.description,
      level: item.cefrLevel,
      detail: [...item.rules, ...item.exceptions].join('\n')
    })),
    ...content.alphabet.map((item) => ({
      id: item.id,
      category: 'alphabet' as const,
      title: item.name,
      subtitle: `Laut: ${item.sound}`,
      arabic: item.letter,
      level: item.cefrLevel,
      detail: item.weightNote ?? item.weightLabel
    })),
    ...content.writing.map((item) => ({
      id: item.id,
      category: 'writing' as const,
      title: item.title,
      subtitle: item.description,
      arabic: item.targetVocalized,
      level: item.cefrLevel,
      detail: [item.prompt, ...item.hints].join('\n')
    })),
    ...content.reading.map((item) => ({
      id: item.id,
      category: 'reading' as const,
      title: item.title,
      subtitle: item.description,
      level: item.cefrLevel,
      detail: item.examples.map((example) => `${example.vocalized} - ${example.german}`).join('\n')
    })),
    ...content.quran.map((item) => ({
      id: item.id,
      category: 'quran' as const,
      title: item.title,
      subtitle: item.description,
      level: item.quranLevel,
      detail: item.rules.join('\n')
    })),
    ...content.sources.map((item) => ({
      id: item.id,
      category: 'source' as const,
      title: item.title,
      subtitle: item.author ?? item.type,
      level: item.reviewStatus,
      detail: [item.edition, item.publisher, item.year, item.notes].filter(Boolean).join(' - ')
    }))
  ];
  return items.map((item) => ({
    ...item,
    searchText: `${item.title} ${item.subtitle} ${item.arabic ?? ''} ${item.detail}`.normalize('NFKC').toLocaleLowerCase('de')
  }));
}

function label(value: Category) {
  return ({
    all: 'Alle',
    vocabulary: 'Vokabeln',
    grammar: 'Grammatik',
    alphabet: 'Alphabet',
    writing: 'Schreiben',
    reading: 'Lesen',
    quran: 'Quran',
    source: 'Quellen'
  } as const)[value];
}

function symbol(value: Exclude<Category, 'all'>) {
  return ({ vocabulary: 'V', grammar: 'G', alphabet: 'A', writing: 'W', reading: 'L', quran: 'Q', source: 'S' } as const)[value];
}

function itemKey(item: Item) {
  return `${item.category}:${item.id}`;
}

function Saved({ items, empty, onOpen }: { items: Item[]; empty: string; onOpen(item: Item): void }) {
  return (
    <div className="saved-list">
      {items.length ? items.map((item) => (
        <button key={itemKey(item)} onClick={() => onOpen(item)}>
          <span>{symbol(item.category)}</span>
          <div>
            <strong>{item.title}</strong>
            <small>{item.isTransliteration ? <Transliteration>{item.subtitle}</Transliteration> : item.subtitle}</small>
          </div>
        </button>
      )) : <small>{empty}</small>}
    </div>
  );
}

function arabicModule(category: Exclude<Category, 'all'>): HarakatModule {
  if (category === 'vocabulary') return 'vocabulary';
  if (category === 'grammar') return 'grammar';
  if (category === 'writing') return 'writing';
  if (category === 'reading') return 'reading';
  if (category === 'quran') return 'quran';
  return 'vocabulary';
}
