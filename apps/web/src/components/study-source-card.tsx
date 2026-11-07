"use client";

import { formatDate, formatNumber, safeSourceUrl } from "@/lib/format";
import { videoEmbedUrl } from "@/lib/video-embed";
import type { StudySource } from "@/lib/study-types";

export function StudySourceCard({ source, index }: { source: StudySource; index: number }) {
  const embed = videoEmbedUrl(source.url);
  const url = safeSourceUrl(source.url);
  const title = source.handle ? `@${source.handle.replace(/^@/, "")}` : source.title;
  return (
    <article className="study-video-card" id={`study-source-${source.id}`} aria-labelledby={`video-title-${index}`}>
      <header className="study-video-header">
        <span className="study-video-number">{String(index + 1).padStart(2, "0")}</span>
        <div><h3 id={`video-title-${index}`}>{title}</h3><p>{embed?.platform ?? source.platform ?? "Source publication"}</p></div>
      </header>
      {embed ? (
        <iframe
          key={embed.url}
          className="study-video-frame"
          src={embed.url}
          title={`Post ${index + 1} by ${title} on ${embed.platform}`}
          loading="lazy"
          allow="encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : <div className="study-video-placeholder"><p>Preview unavailable.</p><p>Open the original publication to view this content.</p></div>}
      <div className="study-video-body">
        <dl className="study-video-facts">
          <div><dt>Observed views</dt><dd>{formatNumber(source.views)}</dd></div>
          <div><dt>Published</dt><dd>{formatDate(source.publishedAt)}</dd></div>
        </dl>
        {url ? <a className="button secondary" href={url} target="_blank" rel="noopener noreferrer">Open original post <span className="sr-only">{index + 1} (new tab)</span><span aria-hidden="true">↗</span></a> : <p>Source link unavailable.</p>}
        <p className="study-video-help">If the player is blocked or requires sign-in, use the original post.</p>
        <details><summary>Source details</summary><p>Observed: {formatDate(source.observedAt ?? null)}</p><p>Reference: {source.id}</p></details>
      </div>
    </article>
  );
}
