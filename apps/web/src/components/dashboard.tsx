"use client";

import Link from "next/link";
import { useState } from "react";
import { EvidenceDialog } from "@/components/evidence-dialog";
import { StatusPanel } from "@/components/status-panel";
import {
  formatDateTime,
  formatNumber,
  formatPublicationWindow,
  initials,
  platformLabel,
} from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";
import type {
  AnalysisStatus,
  BenchmarkReport,
  WorkspaceSnapshot,
} from "@/lib/workspace-types";

const analysisLabels: Record<AnalysisStatus, string> = {
  pending_dispatch: "Analysis request saved",
  queued: "Analysis waiting for processing",
  running: "Analysis in progress",
  succeeded: "Analysis complete",
  partial: "Analysis completed with limits",
  failed: "Latest analysis failed",
  cancelled: "Latest analysis stopped",
};

function LatestAnalysis({
  analysis,
  hasReport,
}: {
  analysis: WorkspaceSnapshot["analysis"];
  hasReport: boolean;
}) {
  if (!analysis) return null;
  const interrupted =
    analysis.status === "failed" || analysis.status === "cancelled";
  return (
    <div className="state-note" role="status">
      <strong>{analysisLabels[analysis.status]}</strong>
      {analysis.stage && <p>Current stage: {analysis.stage}</p>}
      {interrupted && (
        <p>
          {hasReport
            ? "The last available report remains below."
            : "No report is available for this analysis."}
        </p>
      )}
      {analysis.status === "succeeded" && (
        <p>Market coverage may still be incomplete.</p>
      )}
    </div>
  );
}

function Comparison({ report }: { report: BenchmarkReport }) {
  if (!report.comparison.length || !report.platforms.length)
    return (
      <StatusPanel title="Comparison unavailable">
        <p>No restaurant comparison was supplied for this report.</p>
      </StatusPanel>
    );
  return (
    <>
      <p className="mobile-table-note">Scroll to see all measurements.</p>
      <div
        className="table-scroll"
        role="region"
        aria-label="Restaurant comparison"
        tabIndex={0}
      >
        <table className="benchmark-table comparison-table">
          <caption>
            Counts cover this collection only. Views are cumulative counters
            recorded per platform, not growth or unique audience measures.
          </caption>
          <thead>
            <tr>
              <th scope="col">Restaurant</th>
              <th scope="col">Platform</th>
              <th scope="col">Posts</th>
              <th scope="col">Views</th>
            </tr>
          </thead>
          <tbody>
            {report.comparison.flatMap((row) =>
              report.platforms.map((platform) => (
                <tr
                  key={`${row.restaurantId}:${platform}`}
                  className={row.isOwn ? "own-row" : undefined}
                >
                  <th scope="row">
                    {row.name}
                    {row.isOwn && <small>Your restaurant</small>}
                  </th>
                  <td>{platformLabel(platform)}</td>
                  <td>{formatNumber(row.metrics[platform]?.posts ?? null)}</td>
                  <td>{formatNumber(row.metrics[platform]?.views ?? null)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Dashboard() {
  const { state, reload } = useWorkspace();
  const data = state.data;
  const report = data?.report;
  const [evidence, setEvidence] = useState<{
    reportId: string;
    findingId: string;
  } | null>(null);
  const selectedFinding =
    evidence?.reportId === report?.id
      ? report?.findings.find((finding) => finding.id === evidence?.findingId)
      : undefined;
  return (
    <>
      <section
        className={data?.restaurant ? "hero" : "hero hero-single"}
        aria-labelledby="dashboard-title"
      >
        <div className="hero-copy">
          <h1 id="dashboard-title">Analytics overview</h1>
          <p>Compare collected posts and views, then inspect their sources.</p>
          {report && (
            <div className="period">
              <span>
                {formatPublicationWindow(
                  report.publicationWindow.startAt,
                  report.publicationWindow.endAt,
                )}
              </span>
              <span className="status">
                {report.status === "partial" || report.coverage === "partial"
                  ? "Partial result"
                  : "Processing complete"}
              </span>
            </div>
          )}
        </div>
        {data?.restaurant && (
          <aside className="identity-tile" aria-label="Restaurant context">
            <div className="identity-avatar" aria-hidden="true">
              {initials(data.restaurant.name)}
            </div>
            <div>
              <strong>{data.restaurant.name}</strong>
              {data.restaurant.city && <p>{data.restaurant.city}</p>}
              <Link href="/restaurant/">View restaurant profile</Link>
            </div>
          </aside>
        )}
      </section>
      {state.status === "loading" ? (
        <div role="status" aria-busy="true">
          <StatusPanel title="Loading your workspace">
            <p>Retrieving your restaurant and reports.</p>
          </StatusPanel>
        </div>
      ) : state.status !== "ready" ? (
        <StatusPanel
          title="Overview unavailable"
          action={
            state.status === "error" ? (
              <button className="button secondary" onClick={reload}>
                Try again
              </button>
            ) : undefined
          }
        >
          <p>{state.message}</p>
        </StatusPanel>
      ) : (
        <>
          <LatestAnalysis
            analysis={state.data.analysis}
            hasReport={Boolean(report)}
          />
          {!report ? (
            <StatusPanel title="No report available">
              <p>Collected posts, comparisons, and sources will appear here.</p>
            </StatusPanel>
          ) : (
            <>
              <div className="report-context">
                <p>
                  <strong>Report created:</strong>{" "}
                  {formatDateTime(report.createdAt)}
                </p>
                <p>
                  Collected: {formatDateTime(report.collectionWindow.startAt)} –{" "}
                  {formatDateTime(report.collectionWindow.endAt)}
                </p>
                <p>
                  Platforms:{" "}
                  {report.platforms.length
                    ? report.platforms.map(platformLabel).join(", ")
                    : "Not available"}
                </p>
              </div>
              {(report.status === "partial" ||
                report.coverage === "partial" ||
                report.limitations.length > 0) && (
                <div className="state-note">
                  <strong>Coverage and limits</strong>
                  {report.limitations.length ? (
                    <ul>
                      {report.limitations.map((limit, index) => (
                        <li key={index}>{limit}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Partial report. Missing coverage was not specified.</p>
                  )}
                </div>
              )}
              {report.coverage === "empty" ? (
                <StatusPanel title="No content found in this collection">
                  <p>
                    No content was returned for this report’s publication period
                    and platforms. This does not establish a lack of visibility
                    outside the collection.
                  </p>
                </StatusPanel>
              ) : (
                <div className="dashboard-grid">
                  <section aria-labelledby="comparison-title">
                    <div className="section-title">
                      <h2 id="comparison-title">Restaurant comparison</h2>
                    </div>
                    <p className="section-intro">
                      Available posts and views by restaurant and platform.
                    </p>
                    <Comparison report={report} />
                    <div className="scope-line">
                      <div>
                        <strong>
                          {formatNumber(report.distinctPostCount)}
                        </strong>
                        <span>Distinct posts</span>
                      </div>
                      <div>
                        <strong>
                          {formatNumber(report.distinctAccountCount)}
                        </strong>
                        <span>Distinct platform accounts</span>
                      </div>
                    </div>
                    <p className="coverage-note">
                      A post mentioning several restaurants counts once in the
                      collection total. Accounts are not merged across
                      platforms.
                    </p>
                  </section>
                  <aside
                    className="finding-list"
                    aria-label="Report observations"
                  >
                    {report.findings.length ? (
                      report.findings.map((finding) => {
                        const supported = finding.sources.some(
                          (source) => source.availability === "available",
                        );
                        return (
                          <article className="insight" key={finding.id}>
                            <h2>
                              {supported
                                ? finding.title
                                : "Observation unavailable"}
                            </h2>
                            {supported ? (
                              <>
                                {(finding.count !== null ||
                                  finding.denominator !== null) && (
                                  <p className="finding-count">
                                    {finding.count !== null &&
                                    finding.denominator !== null ? (
                                      <>
                                        {formatNumber(finding.count)} of{" "}
                                        {formatNumber(finding.denominator)}{" "}
                                        {finding.denominator === 1
                                          ? "post"
                                          : "posts"}
                                      </>
                                    ) : (
                                      <>
                                        Posts: {formatNumber(finding.count)}.
                                        <br />
                                        Total reviewed:{" "}
                                        {formatNumber(finding.denominator)}.
                                      </>
                                    )}
                                  </p>
                                )}
                                <p>{finding.description}</p>
                                {finding.limitations.length > 0 && (
                                  <ul className="small muted">
                                    {finding.limitations.map((limit, index) => (
                                      <li key={index}>{limit}</li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            ) : (
                              <p>
                                Supporting content is not available. This
                                observation cannot be verified.
                              </p>
                            )}
                            {finding.sources.length > 0 && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  setEvidence({
                                    reportId: report.id,
                                    findingId: finding.id,
                                  })
                                }
                              >
                                {supported
                                  ? "Review supporting sources"
                                  : "Review source records"}
                              </button>
                            )}
                          </article>
                        );
                      })
                    ) : (
                      <div className="no-content-inline">
                        <h2>No supported observations</h2>
                        <p>The available report has no findings to review.</p>
                      </div>
                    )}
                    <Link className="creator-peek" href="/creators/">
                      Creator profiles
                    </Link>
                  </aside>
                </div>
              )}
              <details className="details">
                <summary>Profile context used for this report</summary>
                <dl className="profile-list">
                  <div>
                    <dt>Restaurant</dt>
                    <dd>{report.configurationSnapshot.restaurantName}</dd>
                  </div>
                  <div>
                    <dt>Business goals</dt>
                    <dd>
                      {report.configurationSnapshot.businessGoals.join(", ") ||
                        "Not available"}
                    </dd>
                  </div>
                  <div>
                    <dt>Target customers</dt>
                    <dd>
                      {report.configurationSnapshot.targetCustomers.join(
                        ", ",
                      ) || "Not available"}
                      <small>
                        Declared targets, not measured audience data.
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>Constraints</dt>
                    <dd>
                      {report.configurationSnapshot.constraints ??
                        "Not available"}
                    </dd>
                  </div>
                </dl>
                <p>
                  Profile edits apply to future analyses. This dated report
                  retains its original context.
                </p>
              </details>
            </>
          )}
        </>
      )}
      <EvidenceDialog
        open={Boolean(selectedFinding)}
        onClose={() => setEvidence(null)}
        title="Supporting sources"
        sources={selectedFinding?.sources ?? []}
      />
    </>
  );
}
