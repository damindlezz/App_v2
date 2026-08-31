'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContent } from '../../state/AppProvider';
import { Icon } from '../../components/ui/Icon';
import { AnnotationTools } from '../../components/ui/AnnotationTools';
import { ArabicText, Transliteration } from '../../components/ui/ArabicText';
import { PageTitle } from '../../components/ui/Surface';
import { href, ROUTES } from '../../components/shell/routes';

export type Domain = 'alphabet' | 'vocabulary' | 'grammar' | 'writing' | 'reading';

const META: Record<Domain, { title: string; description: string; practice: string }> = {
  alphabet: { title: 'Alphabet', description: 'Buchstaben, Formen und Laute systematisch festigen.', practice: 'alphabet' },
  vocabulary: { title: 'Wortschatz', description: 'Bedeutung, Wurzeln, Kontext und aktiven Abruf trainieren.', practice: 'vocabulary' },
  grammar: { title: 'Grammatik', description: 'Regeln verstehen, Beispiele analysieren und anwenden.', practice: 'grammar' },
  writing: { title: 'Schreiben', description: 'Nachspuren, kopieren und frei produzieren.', practice: 'writing' },
  reading: { title: 'Lesen', description: 'Harakat, Lesemuster und Verstehen verbinden.', practice: 'reading' }
};

export function DomainPage() {
  const { content, ensureVocabularyDetails } = useAppContent();
  const router = useRouter();
  const [domain, setDomain] = useState<Domain>('vocabulary');
  const [id, setId] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get('domain');
    if (requested && requested in META) setDomain(requested as Domain);
    setId(params.get('id') ?? '');
  }, []);
  useEffect(() => { if (domain === 'vocabulary') void ensureVocabularyDetails().catch(()=>undefined); }, [domain, ensureVocabularyDetails]);

  const items = useMemo(() => {
    if (!content) return [] as any[];
    if (domain === 'alphabet') return content.alphabet;
    if (domain === 'vocabulary') return content.vocabulary;
    if (domain === 'grammar') return content.grammar;
    if (domain === 'writing') return content.writing;
    return content.reading;
  }, [content, domain]);

  const searchIndex = useMemo(() => items.map((item: any) => ({ item, text: domainSearchText(domain, item) })), [domain, items]);
  const itemById = useMemo(() => new Map(items.map((item: any) => [item.id, item])), [items]);
  const normalizedQuery = query.trim().toLocaleLowerCase('de');
  const filtered = useMemo(() => searchIndex
    .filter((entry) => !normalizedQuery || entry.text.includes(normalizedQuery))
    .slice(0, 250)
    .map((entry) => entry.item), [normalizedQuery, searchIndex]);

  if (!content) return null;
  const selected = itemById.get(id) ?? filtered[0];
  const meta = META[domain as Domain];

  function chooseDomain(value: Domain) {
    setDomain(value); setId(''); setQuery('');
    router.replace(href(ROUTES.domain, { domain: value }), { scroll: false });
  }

  function chooseItem(itemId: string) {
    setId(itemId);
    router.replace(href(ROUTES.domain, { domain, id: itemId }), { scroll: false });
  }

  return <div className="standard-page domain-page">
    <PageTitle eyebrow="Fachbereich" title={meta.title} description={meta.description} actions={<button className="button button--primary" onClick={() => router.push(href(ROUTES.practice, { type: meta.practice }))}>
<Icon name="grid" size={17}/> Ueben</button>}/>
    <div className="domain-tabs" role="tablist" aria-label="Arabisch Fachbereiche">{(Object.keys(META) as Domain[]).map(value => <button role="tab" aria-selected={value === domain} className={value === domain ? 'is-active' : ''} key={value} onClick={() => chooseDomain(value)}>{META[value].title}</button>)}</div>
    <div className="domain-layout">
      <aside className="domain-list">
        <label className="search-box">
<Icon name="search" size={17}/>
<input value={query} onChange={event => setQuery(event.target.value)} placeholder={`${meta.title} durchsuchen`}/>
</label>
        <div className="domain-list__count">{filtered.length} Inhalte</div>
        {filtered.map((item: any) => <button className={selected?.id === item.id ? 'is-active' : ''} key={item.id} onClick={() => chooseItem(item.id)}>
<DomainLead domain={domain} item={item}/>
<Icon name="chevron" size={16}/>
</button>)}
      </aside>
      <article className="domain-detail">
        {selected ? <>
<div className="detail-top">
<span className="pill">{selected.cefrLevel ?? ''}</span>
<AnnotationTools entityType="learning_item" entityId={selected.id} compact/>
</div>
<DomainDetail domain={domain} item={selected}/>
<button className="button button--secondary" onClick={() => router.push(href(ROUTES.practice, { type: meta.practice }))}>Passend ueben <Icon name="arrow" size={16}/>
</button>
</> : <div className="empty-state">
<h2>Keine Inhalte</h2>
</div>}
      </article>
    </div>
  </div>;
}

function DomainLead({ domain, item }: { domain: Domain; item: any }) {
  if (domain === 'alphabet') return <>
<ArabicText className="domain-symbol" module="vocabulary" text={item.letter}/>
<div>
<strong>{item.name}</strong>
<small>{item.sound}</small>
</div>
</>;
  if (domain === 'vocabulary') return <>
<ArabicText className="domain-symbol" module="vocabulary" text={item.arabicVocalized}/>
<div>
<strong>{item.german}</strong>
<small>
<Transliteration>{item.transliteration}</Transliteration>
</small>
</div>
</>;
  return <div>
<strong>{item.title}</strong>
<small>{item.description}</small>
</div>;
}

function DomainDetail({ domain, item }: { domain: Domain; item: any }) {
  if (domain === 'alphabet') return <>
<ArabicText as="div" className="domain-hero-arabic" module="vocabulary" text={item.letter}/>
<h1>{item.name}</h1>
<p>Laut: {item.sound}</p>
<div className="forms-grid">{Object.entries(item.forms ?? {}).map(([name, value]) => <div key={name}>
<span>{name}</span>
<ArabicText as="strong" module="vocabulary" text={String(value)}/>
</div>)}</div>
<p>{item.weightNote ?? item.weightLabel}</p>
</>;
  if (domain === 'vocabulary') return <>
<ArabicText as="div" className="domain-hero-arabic" module="vocabulary" text={item.arabicVocalized}/>
<h1>{item.german}</h1>
<p>
<Transliteration>{item.transliteration}</Transliteration>
</p>
<div className="detail-facts">
<span>
<small>Wurzel</small>
<ArabicText as="strong" module="vocabulary" text={item.root ?? '-'}/>
</span>
<span>
<small>Lemma</small>
<ArabicText as="strong" module="vocabulary" text={item.lemmaVocalized ?? '-'}/>
</span>
<span>
<small>Register</small>
<strong>{item.register}</strong>
</span>
</div>{item.translationNote && <p>{item.translationNote}</p>}<h2>Beispiele</h2>{item.examples?.map((example: any) => <div className="example-row" key={example.id}>
<ArabicText module="vocabulary" text={example.arabicVocalized}/>
<strong>{example.german}</strong>
</div>)}</>;
  if (domain === 'grammar') return <>
<h1>{item.title}</h1>
<p>{item.description}</p>
<h2>Regeln</h2>
<ul>{item.rules.map((rule: string) => <li key={rule}>{rule}</li>)}</ul>{item.examples?.slice(0, 6).map((example: any) => <div className="example-row" key={example.id}>
<ArabicText module="grammar" text={example.blocks.map((block: any) => block.arabicVocalized).join(' ')}/>
<strong>{example.translation}</strong>
</div>)}</>;
  if (domain === 'writing') return <>
<h1>{item.title}</h1>
<p>{item.description}</p>
<ArabicText as="div" className="domain-hero-arabic" module="writing" text={item.targetVocalized}/>
<p>{item.prompt}</p>
<ol>{item.strokeSteps?.map((step: any) => <li key={step.step}>
<strong>{step.title}</strong> {step.instruction}</li>)}</ol>
</>;
  return <>
<h1>{item.title}</h1>
<p>{item.description}</p>{item.examples?.slice(0, 8).map((example: any) => <div className="reading-card" key={example.id}>
<ArabicText as="div" module="reading" text={example.vocalized}/>
<strong>{example.german}</strong>
<small>{example.clue}</small>
</div>)}</>;
}

function domainSearchText(domain: Domain, item: any): string {
  let value = '';
  if (domain === 'alphabet') value = `${item.letter ?? ''} ${item.name ?? ''} ${item.sound ?? ''} ${Object.values(item.forms ?? {}).join(' ')}`;
  else if (domain === 'vocabulary') value = `${item.arabicVocalized ?? ''} ${item.arabicUnvocalized ?? ''} ${item.german ?? ''} ${item.transliteration ?? ''} ${item.root ?? ''} ${item.lemmaVocalized ?? ''} ${item.register ?? ''}`;
  else if (domain === 'grammar') value = `${item.title ?? ''} ${item.description ?? ''} ${(item.rules ?? []).join(' ')} ${(item.examples ?? []).map((example: any) => example.translation ?? '').join(' ')}`;
  else if (domain === 'writing') value = `${item.title ?? ''} ${item.description ?? ''} ${item.targetVocalized ?? ''} ${item.prompt ?? ''}`;
  else value = `${item.title ?? ''} ${item.description ?? ''} ${(item.examples ?? []).map((example: any) => `${example.vocalized ?? ''} ${example.german ?? ''} ${example.clue ?? ''}`).join(' ')}`;
  return value.normalize('NFKC').toLocaleLowerCase('de');
}
