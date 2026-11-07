"use client";

import { Dialog } from "@/components/dialog";
import {
  formatDate,
  formatDateTime,
  platformLabel,
  safeSourceUrl,
} from "@/lib/format";
import type { Source } from "@/lib/workspace-types";

export function EvidenceDialog({
  open,
  onClose,
  title,
  sources,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  sources: Source[];
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="Source dates, excerpts, and observation limits."
    >
      {sources.length === 0 && <p>No supporting sources are available.</p>}
      {sources.map((source) => {
        const available = source.availability === "available";
        const url = available ? safeSourceUrl(source.url) : null;
        return (
          <article
            className="source-record"
            key={`${source.snapshotId}:${source.id}:${source.evidenceId ?? "post"}`}
            aria-label={source.title}
          >
            {(sources.length > 1 || title !== source.title) && (
              <h3>{source.title}</h3>
            )}
            <p>
              {platformLabel(source.platform)},{" "}
              {source.author ?? "Author not available"}
            </p>
            <p>Published: {formatDate(source.publishedAt)}</p>
            <p>Observed: {formatDateTime(source.observedAt)}</p>
            {!available ? (
              <p className="source-unavailable">
                {source.availability === "removed"
                  ? "Source removed."
                  : "Source unavailable."}{" "}
                The original content and excerpt cannot be reviewed.
              </p>
            ) : (
              <>
                <p>
                  Evidence: {source.evidenceType ?? "Type not available"}
                  {source.timestampSeconds !== null &&
                    `. Timestamp: ${source.timestampSeconds} seconds`}
                </p>
                {source.excerpt ? (
                  <blockquote>{source.excerpt}</blockquote>
                ) : (
                  <p>Excerpt not available.</p>
                )}
                {url ? (
                  <a
                    className="text-button"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open original source{" "}
                    <span className="visually-hidden">
                      (opens in a new tab)
                    </span>
                  </a>
                ) : (
                  <p>Original link not available.</p>
                )}
              </>
            )}
            <details className="details">
              <summary>Source reference</summary>
              <p>Source: {source.id}</p>
              <p>Snapshot: {source.snapshotId}</p>
            </details>
          </article>
        );
      })}
      <div className="source-limits">
        <strong>Observation limits</strong>
        Sources describe the collected content. They do not establish audience
        geography, restaurant visits, revenue, or causality. A single counter
        snapshot cannot measure growth.
      </div>
    </Dialog>
  );
}
