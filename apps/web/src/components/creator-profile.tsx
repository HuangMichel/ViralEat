"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { mutationErrorMessage } from "@/lib/workspace-errors";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  initials,
  platformLabel,
} from "@/lib/format";
import { EvidenceDialog } from "@/components/evidence-dialog";
import { StatusPanel } from "@/components/status-panel";
import type { Source } from "@/lib/workspace-types";

interface EvidenceSelection {
  workspaceId: string;
  creatorId: string;
  sourceKeys: { id: string; snapshotId: string }[];
  individual: boolean;
}

export function CreatorProfilePage() {
  const { state, reload, setCreatorSelection } = useWorkspace();
  const [creatorId, setCreatorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    creatorId: string;
    error: boolean;
    message: string;
  } | null>(null);
  const [evidence, setEvidence] = useState<EvidenceSelection | null>(null);

  if (state.status !== "ready") {
    return (
      <section>
        <div className="hero">
          <div className="hero-copy">
            <h1>Creator profiles</h1>
          </div>
        </div>
        <StatusPanel
          title={
            state.status === "loading"
              ? "Loading creator profiles"
              : "Creator profiles unavailable"
          }
          action={
            state.status === "error" ? (
              <button className="button secondary" onClick={reload}>
                Try again
              </button>
            ) : undefined
          }
        >
          <p>
            {state.message ??
              (state.status === "loading"
                ? "Retrieving creators and their associated content…"
                : "The workspace connection could not load creator profiles.")}
          </p>
        </StatusPanel>
      </section>
    );
  }
  const { creators, permissions } = state.data;
  const creator = creators.find((item) => item.id === creatorId) ?? creators[0];
  if (!creator) {
    return (
      <section>
        <div className="hero">
          <div className="hero-copy">
            <h1>Creator profiles</h1>
          </div>
        </div>
        <StatusPanel title="No creator profiles available">
          <p>No creators are available in this workspace collection.</p>
        </StatusPanel>
      </section>
    );
  }
  const selectedCreator = creator;
  const hasEvidence = creator.sources.length > 0;
  const hasAvailableEvidence = creator.sources.some(
    (source) => source.availability === "available",
  );
  const visibleSources = creator.sources.slice(0, 3);
  const currentFeedback = feedback?.creatorId === creator.id ? feedback : null;
  // Resolve against the current snapshot so a refresh cannot retain old source data.
  const evidenceSources =
    evidence?.workspaceId === state.data.workspace.id &&
    evidence.creatorId === creator.id
      ? creator.sources.filter((source) =>
          evidence.sourceKeys.some(
            (key) =>
              key.id === source.id && key.snapshotId === source.snapshotId,
          ),
        )
      : [];
  const evidenceTitle =
    evidence?.individual && evidenceSources[0]
      ? evidenceSources[0].title
      : `${creator.displayName}: associated evidence`;

  function openEvidence(individualSource?: Source) {
    const sources =
      individualSource === undefined
        ? selectedCreator.sources
        : [individualSource];
    setEvidence({
      workspaceId: state.status === "ready" ? state.data.workspace.id : "",
      creatorId: selectedCreator.id,
      sourceKeys: sources.map(({ id, snapshotId }) => ({ id, snapshotId })),
      individual: individualSource !== undefined,
    });
  }

  async function toggleSelection() {
    if (saving || !permissions.selectCreators) return;
    const nextSelected = !selectedCreator.selection.selected;
    setSaving(true);
    setFeedback(null);
    try {
      await setCreatorSelection(selectedCreator.id, nextSelected);
      setFeedback({
        creatorId: selectedCreator.id,
        error: false,
        message: nextSelected
          ? "Creator added to your saved selection."
          : "Creator removed from your saved selection.",
      });
    } catch (cause) {
      setFeedback({
        creatorId: selectedCreator.id,
        error: true,
        message: mutationErrorMessage(cause),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="screen" aria-labelledby="creator-title">
      {creators.length > 1 && (
        <div className="state-control">
          <label htmlFor="creator-picker">Creator account</label>
          <select
            id="creator-picker"
            value={creator.id}
            disabled={saving}
            onChange={(event) => {
              setCreatorId(event.target.value);
              setFeedback(null);
              setEvidence(null);
            }}
          >
            {creators.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}, {platformLabel(item.platform)},{" "}
                {item.handle}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="hero profile-hero">
        <div className="hero-copy">
          <h1 id="creator-title" className="creator-profile-name">
            {creator.displayName}
          </h1>
          <p className="profile-platform">
            <span>{creator.handle}</span>
            <span className="platform-badge">
              {platformLabel(creator.platform)}
            </span>
          </p>
          <div className="profile-actions">
            <button
              className="button"
              aria-pressed={creator.selection.selected}
              disabled={saving || !permissions.selectCreators}
              onClick={toggleSelection}
            >
              {saving
                ? "Saving selection…"
                : creator.selection.selected
                  ? "Remove from selection"
                  : "Select creator"}
            </button>
          </div>
          {!permissions.selectCreators && (
            <p className="small muted">
              Saving creator selections is not available for this data connection.
            </p>
          )}
          {currentFeedback && (
            <p
              className="temporary"
              role={currentFeedback.error ? "alert" : "status"}
            >
              {currentFeedback.message}
            </p>
          )}
        </div>
        <div className="profile-portrait creator-portrait">
          <div className="creator-monogram" aria-hidden="true">
            {initials(creator.displayName)}
          </div>
        </div>
      </div>
      <div className="creator-grid">
        <div>
          {hasEvidence ? (
            <div className="data-results">
              <h2>Collection coverage</h2>
              {hasAvailableEvidence ? (
                <>
                  <p className="creator-bio">
                    Observed posts on {platformLabel(creator.platform)}:{" "}
                    {formatNumber(creator.postCount)}. Associated restaurants:{" "}
                    {creator.coveredRestaurants.length}.
                  </p>
                  <div className="topic-chips" aria-label="Observed topics">
                    {creator.topics.length ? (
                      creator.topics.map((topic, index) => (
                        <span key={index}>{topic}</span>
                      ))
                    ) : (
                      <p className="small muted">
                        Observed topics not available.
                      </p>
                    )}
                  </div>
                  <div
                    className="restaurant-chips"
                    aria-label="Restaurants covered"
                  >
                    {creator.coveredRestaurants.length ? (
                      creator.coveredRestaurants.map((restaurant) => (
                        <span key={restaurant.id}>{restaurant.name}</span>
                      ))
                    ) : (
                      <p className="small muted">
                        Restaurant coverage not available.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="state-note">
                  Supporting content is no longer available. Topics, restaurant
                  coverage, and selection reasons cannot be verified.
                </p>
              )}
              <button className="text-button" onClick={() => openEvidence()}>
                Review the creator evidence
              </button>
              <div className="source-preview">
                <div className="source-preview-header">
                  <h3>Associated content</h3>
                  <span className="small muted">
                    Showing {visibleSources.length} of {creator.sources.length}{" "}
                    sources
                  </span>
                </div>
                <div className="source-tiles">
                  {visibleSources.map((source) => (
                    <button
                      className="source-tile"
                      key={`${source.snapshotId}:${source.id}`}
                      onClick={() => openEvidence(source)}
                    >
                      <strong>{source.title}</strong>
                      <small>
                        {platformLabel(source.platform)},{" "}
                        {formatDate(source.publishedAt)}
                      </small>
                      <small>
                        {source.availability === "available"
                          ? "Review source details"
                          : source.availability === "removed"
                            ? "Source removed. Review recorded details"
                            : "Source unavailable. Review recorded details"}
                      </small>
                    </button>
                  ))}
                </div>
                <p className="micro-note">
                  This collection may not cover all account content.
                </p>
              </div>
            </div>
          ) : (
            <StatusPanel title="No associated content available">
              <p>
                No supplied posts support topics, restaurant coverage, or a
                selection reason in this collection. The creator account remains
                visible.
              </p>
            </StatusPanel>
          )}
        </div>
        <aside>
          <div className="creator-facts">
            <h2>Account details</h2>
            <dl className="profile-list">
              <div>
                <dt>Profile location</dt>
                <dd>{creator.profileLocation || "Unknown"}</dd>
              </div>
              <div>
                <dt>Audience geography</dt>
                <dd>
                  {creator.audienceLocation || "Unknown"}
                  <small>Profile location does not locate the audience.</small>
                </dd>
              </div>
              <div>
                <dt>Audience size</dt>
                <dd>
                  {formatNumber(creator.followerCount)}
                  {creator.followerCount !== null && (
                    <small>
                      Followers observed{" "}
                      {formatDateTime(creator.followersObservedAt)}
                    </small>
                  )}
                </dd>
              </div>
              <div>
                <dt>Account identity</dt>
                <dd>
                  {platformLabel(creator.platform)} only
                  <small>No cross-platform identity assumed.</small>
                </dd>
              </div>
            </dl>
          </div>
          {hasAvailableEvidence && (
            <div className="selection-note">
              <h3>Selection reason</h3>
              <p>
                {creator.selectionReason ||
                  "A selection reason has not been supplied. Review the associated content before deciding."}
              </p>
              <p>Collaboration results are unknown.</p>
            </div>
          )}
          <div className="selection-note">
            <h3>Saved selection</h3>
            <p>Saving a selection does not contact this creator.</p>
          </div>
        </aside>
      </div>
      <EvidenceDialog
        open={evidenceSources.length > 0}
        onClose={() => setEvidence(null)}
        title={evidenceTitle}
        sources={evidenceSources}
      />
    </section>
  );
}
