import type { AnalysisStatus, Platform } from "./workspace-types";

const parisDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Paris",
});

const parisDateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function formatNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value)
    ? "Not available"
    : new Intl.NumberFormat("en-GB").format(value);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function formatDate(value: string | null): string {
  const date = parseDate(value);
  return date ? parisDate.format(date) : "Not available";
}

export function formatDateTime(value: string | null): string {
  const date = parseDate(value);
  return date ? `${parisDateTime.format(date)} (Paris)` : "Not available";
}

/** Publication intervals have an inclusive start and an exclusive end. */
export function formatPublicationWindow(
  startAt: string,
  endAt: string,
): string {
  const start = parseDate(startAt);
  const end = parseDate(endAt);
  if (!start || !end || end <= start) return "Period not available";
  return `${parisDate.format(start)} – ${parisDate.format(new Date(end.valueOf() - 1))}`;
}

export function platformLabel(platform: Platform): string {
  return { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" }[
    platform
  ];
}

export function safeSourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function initials(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

export function analysisStatusLabel(status: AnalysisStatus): string {
  return {
    pending_dispatch: "Request saved",
    queued: "Waiting to start",
    running: "Analysis in progress",
    succeeded: "Processing complete",
    partial: "Partial result",
    failed: "Analysis failed",
    cancelled: "Analysis stopped",
  }[status];
}
