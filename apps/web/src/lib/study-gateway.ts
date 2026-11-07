import { safeSourceUrl, formatNumber } from "./format";
import { studyProfiles } from "./study-profiles";
import { WorkspaceProblem } from "./workspace-errors";
import type { StudyAccount, StudyData, StudyItem, StudySource } from "./study-types";
import type { WorkspaceGateway } from "./workspace-types";

type Row = Record<string, unknown>;
function invalid(): never {
  throw new WorkspaceProblem("invalid", "The study export does not match the expected format. Check the study export contract.");
}
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Row;
}
function optionalObject(value: unknown): Row {
  return value == null ? {} : object(value);
}
function rows(value: unknown): Row[] {
  if (value == null) return [];
  if (!Array.isArray(value)) invalid();
  return value.map(object);
}
function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") invalid();
  return value;
}
function strings(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) invalid();
  return value as string[];
}
function number(value: unknown, signed = false): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || (!signed && value < 0)) invalid();
  return value;
}
function date(value: unknown): string | null {
  const result = text(value);
  if (result !== null && !Number.isFinite(Date.parse(result))) invalid();
  return result;
}
function unique(values: string[]): string[] { return [...new Set(values)]; }
function sentence(values: (string | null)[]): string | null {
  return values.filter(value => value !== null && value !== "").join(" · ") || null;
}
function metric(label: string, value: unknown, signed = false, unit = ""): string {
  const result = number(value, signed);
  return `${label}: ${result === null ? "unavailable" : `${result}${unit}`}`;
}
function measurement(label: string, value: string) { return { label, value }; }
function percent(value: unknown): string {
  const result = number(value, true);
  return result === null ? "Not available" : `${formatNumber(result)}%`;
}
function readableMetric(value: string | null): string {
  const labels: Record<string, string> = {
    mean_views: "Average views", median_views: "Median views",
    mean_engagement_views_percent: "Engagement / views", posts_per_week: "Posts per week",
  };
  return value ? labels[value] ?? value.replaceAll("_", " ") : "Peer comparison";
}
function readableStatus(value: string | null): string | null {
  const labels: Record<string, string> = {
    insufficient_data: "Not enough data", increasing: "Increasing", decreasing: "Decreasing",
    stable: "Stable", available: "Available", emerging: "Emerging",
  };
  return value ? labels[value] ?? value.replaceAll("_", " ") : null;
}
function accounts(value: unknown): StudyAccount[] {
  return rows(value).map(row => {
    const metrics = optionalObject(row.metrics);
    return {
      name: text(row.restaurant) ?? text(row.handle) ?? "Unnamed account",
      platform: text(row.platform),
      averageViews: number(metrics.mean_views),
      medianViews: number(metrics.median_views),
      engagementRate: number(metrics.mean_engagement_views_percent),
      // A sampled rate cannot establish the full account's posting frequency.
      postsPerWeek: number(metrics.posts_per_week),
      limitations: unique([...strings(row.limitations), ...strings(metrics.limitations)]),
    };
  });
}
function sourceIds(row: Row): string[] {
  return unique([
    ...strings(row.source_ids),
    ...(row.source_id == null ? [] : [text(row.source_id)!]),
    ...rows(row.evidence).map(evidence => text(evidence.source_id)).filter((id): id is string => id !== null),
  ]);
}
function item(row: Row, id: string, title: string, description: string | null): StudyItem {
  return {
    id, title, description,
    hypothesis: text(row.hypothesis),
    action: text(row.proposed_action),
    effort: text(row.effort),
    outcomeMeasure: text(row.outcome_measure),
    sourceIds: sourceIds(row),
    limitations: unique([...strings(row.constraints_to_check), ...strings(row.limitations)]),
  };
}
function aiWarnings(report: Row, label: string): string[] {
  const ai = optionalObject(report.ai);
  const error = optionalObject(ai.error);
  const availability = text(ai.availability);
  return [
    ...(availability && availability !== "available" ? [`${label} AI: ${availability}`] : []),
    ...[sentence([text(error.code), text(error.message)])].filter((value): value is string => value !== null),
    ...strings(ai.limitations),
  ];
}
function coverage(report: Row, label: string): string[] {
  return rows(report.coverage).map(row => {
    const complete = row.complete_provider_query;
    if (complete != null && typeof complete !== "boolean") invalid();
    return sentence([
      label, text(row.restaurant) ?? text(row.window), text(row.platform),
      metric("Retained", row.retained_unique_contents),
      metric("Provider matches", row.provider_matched_total),
      complete == null ? "Query completeness unavailable" : complete ? "Complete provider query" : "Incomplete provider query",
      ...unique(strings(row.warnings)),
    ])!;
  });
}

/** Explicit allowlist: provider payloads, profile bios and raw captions stay outside the workspace. */
export function parseStudy(value: unknown): StudyData {
  const root = object(value);
  if (!("benchmark" in root) && !("market" in root)) invalid();
  const benchmark = optionalObject(root.benchmark);
  const market = optionalObject(root.market);
  const selection = optionalObject(root.selection_basis);
  const sources = new Map<string, StudySource>();
  for (const row of [...rows(benchmark.sources), ...rows(market.sources)]) {
    const sourceId = text(row.source_id);
    if (!sourceId?.trim()) invalid();
    const url = safeSourceUrl(text(row.external_url));
    const id = sourceId;
    const source: StudySource = {
      id,
      title: sentence([text(row.handle), text(row.platform)]) ?? id,
      platform: text(row.platform), handle: text(row.handle),
      views: number(row.views), format: text(row.format),
      url,
      publishedAt: date(row.published_at),
      observedAt: date(row.fetched_at),
    };
    const previous = sources.get(id);
    sources.set(id, previous ? {
      ...previous,
      url: previous.url ?? source.url,
      publishedAt: previous.publishedAt ?? source.publishedAt,
      observedAt: previous.observedAt ?? source.observedAt,
    } : source);
  }
  const benchmarkConfig = optionalObject(benchmark.configuration_snapshot);
  const marketConfig = optionalObject(market.configuration_snapshot);
  const periods = [
    ["Benchmark", benchmarkConfig.window],
    ["Market current", marketConfig.current],
    ["Market previous", marketConfig.previous],
  ].filter(([, period]) => period != null).map(([label, period]) => {
    const window = object(period);
    return { label: label as string, startAt: date(window.start_at), endAt: date(window.end_at) };
  });
  const observations = rows(optionalObject(market.ai).observations);
  const result: StudyData = {
    selectionBasis: sentence([text(selection.scope_approval), text(selection.peer_relevance), text(selection.source)]),
    createdAt: date(root.generated_at),
    periods,
    analyses: rows(root.analyses).map((row, index) => ({
      id: text(row.analysis_id) ?? `analysis-${index}`,
      status: text(row.status) ?? "unavailable",
      createdAt: date(row.created_at),
      warnings: unique([
        ...strings(row.warnings),
        ...aiWarnings({ ai: { availability: row.ai_availability } }, text(row.kind) ?? "Analysis"),
        ...[sentence([text(optionalObject(row.error).code), text(optionalObject(row.error).message)])].filter((value): value is string => value !== null),
      ]),
      consumption: sentence([
        text(row.kind),
        metric("Oriane requests", row.oriane_requests),
        metric("LLM tokens", row.actual_llm_tokens),
        metric("Sources", row.sources),
        metric("Actions", row.actions),
      ]),
    })),
    ownAccounts: accounts(benchmark.own_accounts),
    competitorAccounts: accounts(benchmark.competitor_accounts),
    peerComparison: rows(benchmark.peer_comparison).map((row, index) => ({
      ...item(row, `peer-${index}`, readableMetric(text(row.metric)), null),
      status: readableStatus(text(row.availability)),
      measurements: [
        measurement("Platform", text(row.platform) ?? "Not available"),
        measurement("Your account", formatNumber(number(row.own_value))),
        measurement("Peer median", formatNumber(number(row.local_median))),
        measurement("Difference", percent(row.relative_difference_percent)),
      ],
    })),
    coverage: unique([
      ...strings(root.warnings), ...strings(root.limitations),
      ...strings(benchmark.warnings), ...strings(benchmark.limitations),
      ...strings(market.warnings), ...strings(market.limitations),
      ...coverage(benchmark, "Benchmark"), ...coverage(market, "Market"),
      ...aiWarnings(benchmark, "Benchmark"), ...aiWarnings(market, "Market"),
      ...(market.product_trend_limitations == null ? [] : [text(market.product_trend_limitations)!]),
    ]),
    trends: rows(market.trends).map((row, index) => ({
      ...item(row, `trend-${index}`, (text(row.topic) ?? "Observed topic").replace(/^hashtag:/, "#").replace(/^product:/, ""), null),
      status: readableStatus(text(row.status)),
      measurements: [
        measurement("Platform", text(row.platform) ?? "Not available"),
        measurement("Current posts", formatNumber(number(row.current_count))),
        measurement("Previous posts", formatNumber(number(row.previous_count))),
        measurement("Change", percent(row.growth_percent)),
      ],
      limitations: unique([...strings(row.limitations), ...(row.abstention_reason ? ["The sample is too limited, incomplete, or has no previous baseline to establish a trend."] : [])]),
    })),
    viralCandidates: rows(market.viral_candidates).map((row, index) => item(row, `viral-${index}`,
      sentence([text(row.platform), text(row.source_id)]) ?? "Viral candidate",
      sentence([metric("Views", row.views), metric("Views per follower", row.views_per_follower_ratio), text(row.basis)]))),
    repeatableFormats: rows(market.repeatable_formats).map((row, index) => item(row, `format-${index}`,
      text(row.label) ?? "Observed format",
      sentence([metric("Distinct posts", row.supporting_distinct_contents), metric("Distinct creators", row.supporting_distinct_creators)]))),
    productOpportunities: rows(market.product_opportunities).map((row, index) => {
      const price = text(row.price_amount);
      if (price !== null && !/^\d+(?:\.\d+)?$/.test(price)) invalid();
      const product = item(row, `product-${index}`, text(row.label) ?? "Observed product",
        sentence([price === null ? "Price unavailable" : `Price: ${price} ${text(row.currency) ?? "(currency unavailable)"}`, text(row.novelty_status)]));
      product.limitations = unique([
        ...(product.limitations ?? []),
        ...observations.filter(observation => observation.source_id === row.source_id).flatMap(observation => strings(observation.limitations)),
      ]);
      return product;
    }),
    actions: [benchmark, market].flatMap((report, reportIndex) => rows(optionalObject(report.ai).actions)
      .map((row, index) => item(row, `action-${reportIndex}-${index}`, `Content experiment ${index + 1}`, text(row.observation)))),
    sources: [...sources.values()],
  };
  return result;
}

export function createStudyGateway(
  url = "/data/study_output.json",
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): WorkspaceGateway {
  return {
    available: true,
    async load(signal) {
      const response = await fetchImpl(url, { signal, cache: "no-store" });
      if (response.status === 404) {
        throw new WorkspaceProblem("unavailable", "Study data has not arrived yet. Add study_output.json and retry.");
      }
      if (!response.ok) {
        throw new WorkspaceProblem("unknown", `The study could not be loaded (HTTP ${response.status}). Try again.`);
      }
      let payload: unknown;
      try { payload = await response.json(); } catch { invalid(); }
      const study = parseStudy(payload);
      return {
        workspace: { id: "study", name: "Brand benchmark" },
        study,
        ...studyProfiles(payload),
        report: null,
        analysis: null,

        permissions: { editRestaurant: false, selectCreators: false },
      };
    },
    async saveRestaurant() { throw new WorkspaceProblem("forbidden"); },
    async setCreatorSelection() { throw new WorkspaceProblem("forbidden"); },
  };
}

export const studyGateway = createStudyGateway(process.env.NEXT_PUBLIC_STUDY_URL || "/data/study_output.json");
