"use client";

import { useState } from "react";
import type { StudyItem, StudySource } from "@/lib/study-types";

export function SourceReferences({ ids, sources }: { ids: string[]; sources: Map<string, StudySource> }) {
  if (!ids.length) return <p className="study-note">No supporting sources supplied.</p>;
  const orderedIds = [...sources.keys()];
  return <ul className="study-references" aria-label="Supporting posts">{[...new Set(ids)].map(id => {
    const index = orderedIds.indexOf(id);
    return <li key={id}>{index >= 0 ? <a href={`#${encodeURIComponent(`study-source-${id}`)}`}>View post {index + 1}</a> : <span>Supporting post unavailable</span>}</li>;
  })}</ul>;
}

function Measurements({ item }: { item: StudyItem }) {
  if (!item.measurements?.length) return null;
  return <dl className="study-measurements">{item.measurements.map((measurement, index) => <div key={index}><dt>{measurement.label}</dt><dd>{measurement.value}</dd></div>)}</dl>;
}

function ItemContent({ item, sources, recommendation = false }: { item: StudyItem; sources: Map<string, StudySource>; recommendation?: boolean }) {
  return <>
    {recommendation && !item.description && <p className="study-observation">{item.title}</p>}
    {item.description && <p className="study-item-description">{item.description}</p>}
    {item.status && <p className="study-note">{item.status}</p>}
    <Measurements item={item} />
    {(recommendation || item.hypothesis || item.action || item.effort || item.outcomeMeasure) && <dl className="study-action-fields">{([
      ["Hypothesis", item.hypothesis], ["Action", item.action], ["Effort", item.effort], ["Outcome measure", item.outcomeMeasure],
    ] as const).map(([label, value]) => value || recommendation ? <div key={label}><dt>{label}</dt><dd>{value ?? "Not supplied"}</dd></div> : null)}</dl>}
    {!!item.limitations?.length && <details className="study-details"><summary>Constraints and limits</summary><ul>{item.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul></details>}
    <SourceReferences ids={item.sourceIds} sources={sources} />
  </>;
}

export function StudySection({ id, title, items, sources, recommendations = false, compact = false }: {
  id: string; title: string; items: StudyItem[]; sources: Map<string, StudySource>; recommendations?: boolean; compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = compact && !expanded ? items.slice(0, 6) : items;
  return <section className={`study-section${recommendations ? " study-recommendations" : ""}`} aria-labelledby={id}>
    <div className="study-section-heading"><h2 id={id}>{title}</h2>{items.length > 0 && <span className="study-note">{items.length} {compact ? "topics" : recommendations ? "proposed" : "observations"}</span>}</div>
    {items.length ? <div id={`${id}-items`} className={compact ? "study-topic-list" : "study-item-list"}>{visible.map((item, index) => <article className="study-item" key={`${item.id}:${index}`}>
      <h3>{recommendations ? `${index + 1}. Content test` : item.title}</h3>
      <ItemContent item={item} sources={sources} recommendation={recommendations} />
    </article>)}</div> : <p className="study-note">No {title.toLowerCase()} supplied in this study.</p>}
    {compact && items.length > 6 && <button className="button secondary study-show-all" aria-expanded={expanded} aria-controls={`${id}-items`} onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer topics" : `Show all ${items.length} topics`}</button>}
  </section>;
}

export function PeerComparisons({ items, sources }: { items: StudyItem[]; sources: Map<string, StudySource> }) {
  const unavailable = items.length > 0 && items.every(item => item.status === "Not enough data" || item.status === "Insufficient data" || item.status === "insufficient_data");
  if (!unavailable) return <StudySection id="study-peers" title="Peer comparisons" items={items} sources={sources} />;
  return <section className="study-section" aria-labelledby="study-peers"><h2 id="study-peers">Peer comparisons</h2><p className="study-note">Insufficient data to calculate a reliable peer comparison. Peer medians and relative differences remain unavailable.</p><details className="study-details"><summary>View comparison details</summary>{items.map((item, index) => <article className="study-item" key={`${item.id}:${index}`}><h3>{item.title}</h3><ItemContent item={item} sources={sources} /></article>)}</details></section>;
}
