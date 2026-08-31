'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { flattenCourseModules } from '../../shared/course-module';
import {
  loadIslamicModuleSearchCatalog,
  type IslamicModuleSearchRecord,
} from '../../services/content/content-service';
import { validReference } from '../../features/quran/quran-utils';
import type { LearningContent } from '../../types/models';
import { useAppContent } from '../../state/AppProvider';
import { Icon } from '../ui/Icon';
import { ROUTES, href } from '../shell/routes';

type SearchTarget = {
  kind: 'module' | 'vocabulary' | 'quran' | 'source' | 'skill';
  id: string;
};

interface SearchRecord {
  key: string;
  title: string;
  subtitle: string;
  text: string;
  target: SearchTarget;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose(): void }) {
  const { content, ensureSourceCatalog } = useAppContent();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [islamicModules, setIslamicModules] = useState<IslamicModuleSearchRecord[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void ensureSourceCatalog().catch(() => undefined);
    void loadIslamicModuleSearchCatalog()
      .then(items => {
        if (!cancelled) setIslamicModules(items);
      })
      .catch(() => undefined);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => input.current?.focus());

    return () => {
      cancelled = true;
      removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, ensureSourceCatalog]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const index = useMemo(
    () => (content ? buildIndex(content, islamicModules) : []),
    [content, islamicModules],
  );
  const deferredQuery = useDeferredValue(query);
  const direct = validReference(query.trim());
  const matches = useMemo(() => {
    const normalizedQuery = norm(deferredQuery);
    const list = normalizedQuery
      ? index.filter(item => item.text.includes(normalizedQuery)).slice(0, 20)
      : index.slice(0, 10);

    return direct
      ? [
          {
            key: `q:${direct}`,
            title: direct,
            subtitle: 'Quran-Referenz',
            text: direct,
            target: { kind: 'quran' as const, id: direct },
          },
          ...list,
        ]
      : list;
  }, [index, deferredQuery, direct]);

  if (!open || !content) return null;

  function go(target: SearchTarget) {
    onClose();
    if (target.kind === 'module') router.push(href(ROUTES.module, { id: target.id }));
    else if (target.kind === 'vocabulary') router.push(href(ROUTES.domain, { domain: 'vocabulary', id: target.id }));
    else if (target.kind === 'quran') router.push(href(ROUTES.quran, { ref: target.id }));
    else if (target.kind === 'source') router.push(href(ROUTES.sources, { id: target.id }));
    else router.push(ROUTES.progress);
  }

  return (
    <div
      className="search-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="search-dialog" role="dialog" aria-modal="true">
        <div className="search-input">
          <Icon name="search" size={20} />
          <input
            ref={input}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Modul, Wort, Quelle oder 2:255"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="search-results">
          {matches.map(item => (
            <button key={item.key} onClick={() => go(item.target)}>
              <span className="search-symbol">{item.target.kind[0].toUpperCase()}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </div>
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function buildIndex(content: LearningContent, islamicModules: IslamicModuleSearchRecord[]): SearchRecord[] {
  const out: SearchRecord[] = [];

  for (const module of flattenCourseModules(content)) {
    out.push({
      key: `m:${module.unit.id}`,
      title: module.unit.title,
      subtitle: `${module.chapter.title} · Lernmodul`,
      text: norm(`${module.unit.title} ${module.unit.objective} ${module.chapter.title}`),
      target: { kind: 'module', id: module.unit.id },
    });
  }

  for (const module of islamicModules) {
    out.push({
      key: `m:${module.id}`,
      title: module.title,
      subtitle: `${module.chapterTitle} · Lernmodul`,
      text: norm(`${module.title} ${module.objective} ${module.chapterTitle} ${module.track}`),
      target: { kind: 'module', id: module.id },
    });
  }

  for (const vocabulary of content.vocabulary) {
    out.push({
      key: `v:${vocabulary.id}`,
      title: vocabulary.arabicVocalized || vocabulary.arabicUnvocalized,
      subtitle: `${vocabulary.german} · Wortschatz`,
      text: norm(`${vocabulary.arabicVocalized} ${vocabulary.german} ${vocabulary.transliteration}`),
      target: { kind: 'vocabulary', id: vocabulary.id },
    });
  }

  for (const quran of content.quran) {
    const reference = quran.quranReferences?.[0];
    if (!reference) continue;
    out.push({
      key: `q:${quran.id}`,
      title: quran.title,
      subtitle: `${reference} · Quran`,
      text: norm(`${quran.title} ${quran.description} ${reference}`),
      target: { kind: 'quran', id: reference },
    });
  }

  for (const source of content.sources ?? []) {
    out.push({
      key: `s:${source.id}`,
      title: source.title,
      subtitle: `${source.author ?? 'Quelle'} · Bibliothek`,
      text: norm(`${source.title} ${source.author ?? ''}`),
      target: { kind: 'source', id: source.id },
    });
  }

  for (const skill of content.skills ?? []) {
    out.push({
      key: `k:${skill.id}`,
      title: skill.title,
      subtitle: `${skill.domain} · Kompetenz`,
      text: norm(`${skill.title} ${skill.description}`),
      target: { kind: 'skill', id: skill.id },
    });
  }

  return [...new Map(out.map(item => [item.key, item])).values()];
}

function norm(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('de').trim();
}
