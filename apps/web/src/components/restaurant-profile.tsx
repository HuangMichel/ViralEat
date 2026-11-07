"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import {
  formatNumber,
  formatPublicationWindow,
  initials,
  platformLabel,
  safeSourceUrl,
} from "@/lib/format";
import { Dialog } from "@/components/dialog";
import { StatusPanel } from "@/components/status-panel";
import { RestaurantForm } from "@/components/restaurant-form";
import type { RestaurantDraft } from "@/lib/workspace-types";

export function RestaurantProfilePage() {
  const { state, reload, saveRestaurant } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (state.status !== "ready") {
    return (
      <section>
        <div className="hero">
          <div className="hero-copy">
            <h1>Restaurant profile</h1>
          </div>
        </div>
        <StatusPanel
          title={
            state.status === "loading"
              ? "Loading restaurant profile"
              : "Restaurant profile unavailable"
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
                ? "Retrieving your restaurant context…"
                : "The workspace connection could not load this profile.")}
          </p>
        </StatusPanel>
      </section>
    );
  }
  const { restaurant, report, permissions, study } = state.data;
  const ownSources = state.data.creators
    .filter(creator => restaurant?.socialAccounts.some(account =>
      account.platform === creator.platform &&
      account.handle.toLowerCase() === creator.handle.toLowerCase(),
    ))
    .flatMap(creator => creator.sources);
  if (!restaurant) {
    return (
      <section>
        <div className="hero">
          <div className="hero-copy">
            <h1>Restaurant profile</h1>
          </div>
        </div>
        <StatusPanel title="No restaurant profile available">
          <p>
            A saved restaurant profile has not been supplied. Profile creation
            will be available when the workspace connection supports it.
          </p>
        </StatusPanel>
      </section>
    );
  }

  function closeEditor() {
    if (!saving) setEditing(false);
  }

  async function save(draft: RestaurantDraft) {
    await saveRestaurant(draft);
    setSaved(true);
    setEditing(false);
  }

  return (
    <section className="screen" aria-labelledby="restaurant-title">
      <div className="hero profile-hero">
        <div className="hero-copy">
          <h1 id="restaurant-title">{restaurant.name}</h1>
          <p>
            {[restaurant.category, restaurant.city]
              .filter(Boolean)
              .join(", ") || "Location and category unknown."}
          </p>
          <div className="profile-actions">
            <button
              className="button"
              disabled={!permissions.editRestaurant}
              onClick={() => {
                setSaved(false);
                setEditing(true);
              }}
            >
              Edit profile
            </button>
          </div>
          {!permissions.editRestaurant && (
            <p className="small muted">
              Profile editing is not available for this data connection.
            </p>
          )}
          {saved && (
            <p className="temporary" role="status">
              Profile saved. Your next analysis can use this context.
            </p>
          )}
        </div>
        <div className="profile-portrait">
          <div className="creator-monogram" aria-hidden="true">
            {initials(restaurant.name)}
          </div>
        </div>
      </div>
      <div className="profile-grid">
        <div>
          <div className="section-title">
            <h2>Restaurant details</h2>
            <span className="declared">{study ? "Supplied study configuration" : "Declared by the owner"}</span>
          </div>
          <dl className="profile-list">
            <div>
              <dt>Location</dt>
              <dd>{restaurant.city || "Unknown"}</dd>
            </div>
            <div>
              <dt>Competitive area</dt>
              <dd>{restaurant.competitiveArea || "Unknown"}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{restaurant.category || "Unknown"}</dd>
            </div>
            <div>
              <dt>Positioning</dt>
              <dd>{restaurant.positioning || "Unknown"}</dd>
            </div>
            <div>
              <dt>Business goals</dt>
              <dd>
                {restaurant.businessGoals.length
                  ? restaurant.businessGoals.join("; ")
                  : "Unknown"}
              </dd>
            </div>
            <div>
              <dt>Target customers</dt>
              <dd>
                {restaurant.targetCustomers.length
                  ? restaurant.targetCustomers.join("; ")
                  : "Unknown"}
                <small>A declared target, not measured audience data.</small>
              </dd>
            </div>
            <div>
              <dt>Content time</dt>
              <dd>{restaurant.timeAvailable || "Unknown"}</dd>
            </div>
            <div>
              <dt>Test budget</dt>
              <dd>{restaurant.testBudget || "Unknown"}</dd>
            </div>
            <div>
              <dt>Known constraints</dt>
              <dd>{restaurant.constraints || "Unknown"}</dd>
            </div>
          </dl>
          <details className="details">
            <summary>Optional social identifiers</summary>
            <div className="social-row">
              {restaurant.socialAccounts.length ? (
                restaurant.socialAccounts.map((account, index) => {
                  const url = safeSourceUrl(account.url);
                  return (
                    <span key={`${account.platform}-${index}`}>
                      {platformLabel(account.platform)}:{" "}
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {account.handle}
                        </a>
                      ) : (
                        account.handle
                      )}
                    </span>
                  );
                })
              ) : (
                <span>No social identifiers supplied.</span>
              )}
            </div>
            <p>
              Social links are optional. They do not verify ownership or give
              access to private statistics.
            </p>
          </details>
        </div>
        <div>
          {study ? (
            <div className="data-results own-content">
              <h2>Study coverage</h2>
              <p>{formatNumber(new Set(ownSources.map(source => source.id)).size)} distinct supplied posts from the restaurant account.</p>
              <p className="small muted">This brand account collection does not establish local branch performance, customer demographics, visits, or revenue.</p>
            </div>
          ) : !report || report.coverage === "empty" ? (
            <StatusPanel
              title={
                report
                  ? "No content available in this collection"
                  : "Collection unavailable"
              }
            >
              <p>
                {report
                  ? `Publication period: ${formatPublicationWindow(report.publicationWindow.startAt, report.publicationWindow.endAt)}. No observed counts are available. This does not establish a lack of online visibility.`
                  : "No report has been supplied. The restaurant profile remains available."}
              </p>
            </StatusPanel>
          ) : (
            <div className="data-results own-content">
              <div className="section-title">
                <h2>Collected content</h2>
              </div>
              <p className="small muted">
                {formatPublicationWindow(
                  report.publicationWindow.startAt,
                  report.publicationWindow.endAt,
                )}
                . Five-restaurant benchmark
              </p>
              <p>
                Posts about your restaurant: {formatNumber(report.ownPostCount)}
                .
              </p>
              <div className="author-split">
                <div>
                  <strong>{formatNumber(report.ownerAuthoredCount)}</strong>
                  <span>Owner-authored posts</span>
                </div>
                <div>
                  <strong>{formatNumber(report.thirdPartyCount)}</strong>
                  <span>Third-party posts</span>
                </div>
              </div>
              <p className="small muted">
                Missing author information remains unknown.
              </p>
              {report.limitations.map((limitation, index) => (
                <p className="coverage-note" key={index}>
                  {limitation}
                </p>
              ))}
            </div>
          )}
          <div className="snapshot-note">
            <strong>{report ? "Report context" : "Analysis context"}</strong>
            {report ? (
              <>
                <p>Profile changes apply to the next analysis.</p>
                <p>Restaurant: {report.configurationSnapshot.restaurantName}</p>
                <p>
                  Goals:{" "}
                  {report.configurationSnapshot.businessGoals.join("; ") ||
                    "Unknown"}
                </p>
                <p>
                  Target customers:{" "}
                  {report.configurationSnapshot.targetCustomers.join("; ") ||
                    "Unknown"}
                </p>
                <p>
                  Constraints:{" "}
                  {report.configurationSnapshot.constraints || "Unknown"}
                </p>
              </>
            ) : (
              <p>{study ? "This profile reflects the saved study configuration. Editing is unavailable." : "Profile changes apply to future analyses."}</p>
            )}
          </div>
          <details className="details">
            <summary>Unavailable measurements</summary>
            <p>
              Audience demographics and geography, private reach, restaurant
              visits, and revenue are not established by this profile. Declared
              target customers do not fill these gaps.
            </p>
          </details>
        </div>
      </div>
      <Dialog
        open={editing}
        onClose={closeEditor}
        title="Edit restaurant profile"
        description="Owner-declared information for your next analysis."
      >
        {editing && (
          <RestaurantForm
            profile={restaurant}
            canEdit={permissions.editRestaurant}
            onSave={save}
            onCancel={closeEditor}
            onSavingChange={setSaving}
          />
        )}
      </Dialog>
    </section>
  );
}
