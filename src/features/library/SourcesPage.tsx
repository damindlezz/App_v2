'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContent } from '../../state/AppProvider';
import { contentIndex } from '../../shared/content-index';
import { AnnotationTools } from '../../components/ui/AnnotationTools';
import { Icon } from '../../components/ui/Icon';
import { PageTitle, Surface } from '../../components/ui/Surface';
import { href, ROUTES } from '../../components/shell/routes';

export function SourcesPage() {
  const { content, ensureSourceCatalog, ensureSources } = useAppContent();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    void ensureSourceCatalog().catch(()=>undefined);
    const id = new URLSearchParams(location.search).get('id');
    if (id) setSelectedId(id);
  }, [ensureSourceCatalog]);

  const index = useMemo(() => content ? contentIndex(content) : null, [content]);
  const types = useMemo(() => content ? [...new Set(content.sources.map((source) => source.type))].sort() : [], [content]);
  const normalizedQuery = query.trim().toLocaleLowerCase('de');
  const filtered = useMemo(() => {
    if (!content) return [];
    return content.sources
      .filter((source) => (type === 'all' || source.type === type)
        && (!normalizedQuery || `${source.title} ${source.author ?? ''} ${source.notes ?? ''}`.toLocaleLowerCase('de').includes(normalizedQuery)))
      .slice(0, 250);
  }, [content, normalizedQuery, type]);
  const selected = useMemo(
    () => (selectedId ? index?.sourceById.get(selectedId) : undefined) ?? filtered[0],
    [filtered, index, selectedId]
  );
  useEffect(() => {
    if (selected?.id) void ensureSources(selected.id).catch(()=>undefined);
  }, [ensureSources, selected?.id]);
  const evidence = useMemo(() => {
    if (!selected || !index) return { citations: [], claims: [] };
    const citations = index.citationsBySourceId.get(selected.id) ?? [];
    const claims = citations.flatMap((citation) => (index.linksByCitationId.get(citation.id) ?? []).flatMap((link) => {
      const claim = index.claimById.get(link.claimId);
      return claim ? [{ link, claim, citation }] : [];
    }));
    return { citations, claims };
  }, [index, selected]);

  if (!content) return null;

  return <div className="standard-page sources-page">
    <PageTitle eyebrow="Quellen" title="Quellenbibliothek" description="Bibliografie, Nachweise und Claims transparent zusammengefuehrt."/>
    <div className="library-toolbar">
      <label className="search-box"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel, Autor oder Notiz"/></label>
      <select value={type} onChange={(event) => setType(event.target.value)}>
        <option value="all">Alle Quellentypen</option>
        {types.map((value) => <option key={value} value={value}>{label(value)}</option>)}
      </select>
    </div>
    <div className="sources-layout">
      <div className="source-list">
        <div className="library-list__meta"><strong>{filtered.length}</strong><span>Quellen</span></div>
        {filtered.map((source) => <button key={source.id} className={selected?.id === source.id ? 'is-active' : ''} onClick={() => {
          setSelectedId(source.id);
          router.replace(href(ROUTES.sources, { id: source.id }), { scroll: false });
        }}><div><strong>{source.title}</strong><span>{source.author ?? label(source.type)}</span></div><small>{source.reviewStatus}</small></button>)}
      </div>
      {selected && <Surface className="source-detail">
        <div className="detail-top"><span className="pill">{label(selected.type)} · {selected.reviewStatus}</span><AnnotationTools entityType="source" entityId={selected.id}/></div>
        <h1>{selected.title}</h1>
        {selected.author && <p><strong>{selected.author}</strong></p>}
        <div className="detail-facts">
          <span><small>Sprache</small><strong>{selected.language}</strong></span>
          <span><small>Bibliografie</small><strong>{selected.bibliographicStatus}</strong></span>
          {selected.year && <span><small>Jahr</small><strong>{selected.year}</strong></span>}
          {selected.madhhab && <span><small>Madhhab</small><strong>{selected.madhhab}</strong></span>}
        </div>
        {selected.edition && <p>{selected.edition}</p>}
        {selected.publisher && <p>{selected.publisher}</p>}
        {selected.notes && <p>{selected.notes}</p>}
        {selected.canonicalUrl && <button className="button button--secondary" onClick={() => window.open(selected.canonicalUrl, '_blank', 'noopener,noreferrer')}>Quelle oeffnen</button>}
        <section className="source-evidence">
          <span className="section-eyebrow">Nachweise</span>
          <h2>{evidence.citations.length} Zitate · {evidence.claims.length} Claims</h2>
          {evidence.citations.map((citation) => <article key={citation.id}>
            <strong>{citation.locatorText}</strong>
            <span>{[citation.volume && `Bd. ${citation.volume}`, citation.page && `S. ${citation.page}`, citation.chapter, citation.hadithNumber && `Hadith ${citation.hadithNumber}`, citation.quranRef].filter(Boolean).join(' · ')}</span>
            <small>{citation.reviewStatus}{citation.exactLocatorVerified ? ' · Locator verifiziert' : ''}</small>
          </article>)}
        </section>
        {evidence.claims.length > 0 && <section className="source-claims">
          <span className="section-eyebrow">Belegte Aussagen</span>
          {evidence.claims.slice(0, 80).map(({ claim, link, citation }) => <article key={link.id}>
            <strong>{claim.text}</strong>
            <span>{link.relation} · {citation.locatorText}</span>
            {link.note && <small>{link.note}</small>}
          </article>)}
        </section>}
      </Surface>}
    </div>
  </div>;
}

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}
