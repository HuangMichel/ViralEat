import { formatDateTime, formatNumber } from "@/lib/format";
import type { StudyAccount, StudyData, StudySource } from "@/lib/study-types";
import { StudySourceCard } from "./study-source-card";
import { PeerComparisons, StudySection } from "./study-sections";

function accountMeasurements(account: StudyAccount) {
  return [
    ["Average views", formatNumber(account.averageViews)],
    ["Median views", formatNumber(account.medianViews)],
    ["Engagement / views", account.engagementRate === null ? "Not available" : `${formatNumber(account.engagementRate)}%`],
    ["Posts / week", formatNumber(account.postsPerWeek)],
  ];
}

function OwnAccounts({ accounts }: { accounts: StudyAccount[] }) {
  if (!accounts.length) return <p className="study-note">Your account metrics are not available in this study.</p>;
  return <div role="region" aria-label="Your account measurements">{accounts.map((account, index) => <article className="study-account" key={`${account.name}:${index}`}>
    <div className="study-account-heading"><h3>{account.name}</h3><span>{account.platform ?? "Platform not available"}</span></div>
    <dl className="study-stat-strip">{accountMeasurements(account).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </article>)}</div>;
}

function Competitors({ accounts }: { accounts: StudyAccount[] }) {
  if (!accounts.length) return <p className="study-note">No competitor accounts supplied in this study.</p>;
  return <><p className="study-note">Compare within the same platform. Missing values remain unavailable.</p><p className="study-scroll-hint">Scroll the table to see all measurements.</p><div className="study-table-scroll" role="region" aria-label="Competitor account comparison" tabIndex={0}><table className="study-comparison-table">
    <caption>Account metrics do not measure visits or sales.</caption>
    <thead><tr><th scope="col">Account</th><th scope="col">Platform</th><th scope="col">Average views</th><th scope="col">Median views</th><th scope="col">Engagement / views</th><th scope="col">Posts / week</th></tr></thead>
    <tbody>{accounts.map((account, index) => <tr key={`${account.name}:${index}`}><th scope="row">{account.name}</th><td>{account.platform ?? "Not available"}</td>{accountMeasurements(account).map(([label, value]) => <td key={label}>{value}</td>)}</tr>)}</tbody>
  </table></div></>;
}

function Methodology({ study }: { study: StudyData }) {
  return <section className="study-section" aria-labelledby="study-methodology"><h2 id="study-methodology">Methodology</h2><details className="study-details"><summary>Study scope, coverage, and analysis warnings</summary>
    <div className="study-method-content"><h3>Study scope and coverage</h3><p><strong>Selection basis:</strong> {study.selectionBasis ?? "Not supplied"}</p>
      {study.periods?.map(period => <p key={period.label}><strong>{period.label}:</strong> {formatDateTime(period.startAt)} – {formatDateTime(period.endAt)}</p>)}
      {study.coverage.length ? <ul>{study.coverage.map((note, index) => <li key={index}>{note}</li>)}</ul> : <p>Coverage details were not supplied.</p>}
      {[...study.ownAccounts, ...study.competitorAccounts].map((account, index) => account.limitations?.length ? <div key={index}><h3>{account.name}: measurement limits</h3><ul>{account.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul></div> : null)}
      <h3>Analysis records and warnings</h3>{study.analyses.length ? study.analyses.map((analysis, index) => <article className="study-item" key={`${analysis.id}:${index}`}><h4>Analysis {index + 1}</h4><p>Status: {analysis.status}</p><p>Created: {formatDateTime(analysis.createdAt)}</p><p>Consumption: {analysis.consumption ?? "Not supplied"}</p>{analysis.warnings.length ? <ul>{analysis.warnings.map((warning, warningIndex) => <li key={warningIndex}>{warning}</li>)}</ul> : <p>No warnings supplied.</p>}</article>) : <p>No analysis records supplied.</p>}
    </div></details></section>;
}

export function StudyDashboard({ study }: { study: StudyData }) {
  const sources = new Map<string, StudySource>();
  for (const source of study.sources) if (!sources.has(source.id)) sources.set(source.id, source);
  return <div className="study-dashboard">
    <section className="study-hero" aria-labelledby="study-title"><div><h1 id="study-title">Brand benchmark study</h1><p>Account performance, market topics, and content tests.</p></div><div className="study-hero-meta"><span className="status">Partial study</span><span>Created: {formatDateTime(study.createdAt)}</span></div></section>
    <aside className="study-caution" aria-label="Study limitations"><strong>Partial evidence, provisional conclusions</strong><p>Provisional AI analysis. This is a brand benchmark, not a comparison of local Paris restaurants. Incomplete coverage limits comparisons; review supporting posts before using recommendations. This study does not establish market growth, restaurant visits, or sales.</p></aside>
    <nav className="study-nav" aria-label="Study sections"><a href="#study-own">Account</a><a href="#study-actions">Actions</a><a href="#study-competitors">Competitors</a><a href="#study-trends">Market topics</a><a href="#study-sources">Videos & sources</a><a href="#study-methodology">Methodology</a></nav>
    <section className="study-section" aria-labelledby="study-own"><h2 id="study-own">Your account metrics</h2><OwnAccounts accounts={study.ownAccounts} /></section>
    <StudySection id="study-actions" title="Recommended actions" items={study.actions} sources={sources} recommendations />
    <section className="study-section" aria-labelledby="study-competitors"><h2 id="study-competitors">Competitor accounts</h2><Competitors accounts={study.competitorAccounts} /></section>
    <PeerComparisons items={study.peerComparison} sources={sources} />
    <StudySection id="study-trends" title="Market trends" items={study.trends} sources={sources} compact />
    <StudySection id="study-products" title="Product opportunities" items={study.productOpportunities} sources={sources} />
    <div className="study-secondary-sections"><StudySection id="study-viral" title="Viral candidates" items={study.viralCandidates} sources={sources} /><StudySection id="study-formats" title="Repeatable formats" items={study.repeatableFormats} sources={sources} /></div>
    <p className="study-note">Candidate labels do not establish measured growth or acceleration.</p>
    <section className="study-section" aria-labelledby="study-sources"><div className="study-section-heading"><h2 id="study-sources">Videos & sources</h2><span className="study-note">{sources.size} supporting posts</span></div>{sources.size ? <div className="study-source-grid">{[...sources.values()].map((source, index) => <StudySourceCard source={source} index={index} key={source.id} />)}</div> : <p className="study-note">No source records supplied. Observations cannot be verified from this study.</p>}</section>
    <Methodology study={study} />
  </div>;
}
