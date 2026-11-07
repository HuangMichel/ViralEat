import { platformLabel, safeSourceUrl } from "./format";
import { WorkspaceProblem } from "./workspace-errors";
import type {
  AnalysisStatus,
  BenchmarkReport,
  CreatorProfile,
  Finding,
  Platform,
  RestaurantProfile,
  Source,
  WorkspaceGateway,
  WorkspaceSnapshot,
} from "./workspace-types";

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WorkspaceProblem("invalid");
  return value as JsonObject;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new WorkspaceProblem("invalid");
  return value;
}
function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new WorkspaceProblem("invalid");
  return value;
}
function nullableCount(value: unknown): number | null {
  return value == null ? null : count(value);
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new WorkspaceProblem("invalid");
  return value;
}
function strings(value: unknown): string[] {
  return array(value).map(text);
}
function rows(value: unknown): JsonObject[] {
  return array(value).map(object);
}
function platform(value: unknown): Platform {
  if (value !== "tiktok" && value !== "instagram" && value !== "youtube")
    throw new WorkspaceProblem("invalid");
  return value;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result)))
    throw new WorkspaceProblem("invalid");
  return result;
}
function nullableDate(value: unknown): string | null {
  return value == null ? null : date(value);
}

function restaurantInput(value: unknown) {
  const item = object(value);
  return {
    name: text(item.name),
    city: text(item.city),
    district: nullableText(item.district),
    handles: strings(item.handles),
  };
}
function request(value: unknown) {
  const item = object(value);
  const common = {
    platforms: array(item.platforms).map(platform),
    languages: strings(item.languages),
    country: nullableText(item.country),
  };
  if (!common.platforms.length) throw new WorkspaceProblem("invalid");
  if (item.kind === "benchmark") {
    return {
      ...common,
      kind: "benchmark" as const,
      restaurant: restaurantInput(item.restaurant),
      competitors: array(item.competitors).map(restaurantInput),
      goals: strings(item.goals),
      constraints: strings(item.constraints),
    };
  }
  if (item.kind === "market")
    return {
      ...common,
      kind: "market" as const,
      niche: text(item.niche),
      city: text(item.city),
      topics: strings(item.topics),
    };
  throw new WorkspaceProblem("invalid");
}
type Request = ReturnType<typeof request>;
function scopeKey(value: Request): string {
  // Object keys are constructed above. Sort set-like filters, while retaining restaurant order (r0, r1...).
  const normalized = {
    ...value,
    platforms: [...value.platforms].sort(),
    languages: [...value.languages].sort(),
  };
  return JSON.stringify(normalized);
}
function analysis(value: unknown) {
  const item = object(value);
  if (
    item.status !== "running" &&
    item.status !== "done" &&
    item.status !== "failed"
  )
    throw new WorkspaceProblem("invalid");
  const progress = object(item.progress);
  return {
    id: text(item.id),
    status: item.status,
    request: request(item.request),
    createdAt: date(item.created_at),
    finishedAt: nullableDate(item.finished_at),
    stage: text(progress.phase),
    report: item.report == null ? null : object(item.report),
  };
}
type Analysis = ReturnType<typeof analysis>;

function profile(req: Request): RestaurantProfile | null {
  if (req.kind !== "benchmark") return null;
  return {
    id: "r0",
    revision: 0,
    name: req.restaurant.name,
    city: req.restaurant.city,
    competitiveArea: req.restaurant.district,
    category: null,
    positioning: null,
    businessGoals: req.goals,
    targetCustomers: [],
    timeAvailable: null,
    testBudget: null,
    constraints: req.constraints.length ? req.constraints.join("; ") : null,
    socialAccounts: [],
  };
}

interface ObservedSource {
  source: Source;
  followers: number | null;
  restaurantIds: string[];
}
function observedSource(
  value: unknown,
  expectedId: string,
  reportId: string,
): ObservedSource {
  const item = object(value);
  if (text(item.id) !== expectedId) throw new WorkspaceProblem("invalid");
  const author = nullableText(item.author_handle);
  return {
    source: {
      id: expectedId,
      snapshotId: reportId,
      title: author ? `Post by @${author.replace(/^@/, "")}` : "Collected post",
      platform: platform(item.platform),
      author,
      publishedAt: nullableDate(item.published_at),
      observedAt: date(item.fetched_at),
      url:
        safeSourceUrl(nullableText(item.post_url)) ??
        safeSourceUrl(nullableText(item.url)),
      excerpt: null,
      evidenceType: null,
      timestampSeconds: null,
      availability: "available",
    },
    followers: nullableCount(item.author_followers),
    restaurantIds: strings(item.restaurant_ids),
  };
}

function reportRows(report: JsonObject, name: string): JsonObject[] {
  return rows(report[name]);
}
function evidenceRows(report: JsonObject): JsonObject[] {
  return Object.entries(object(report.evidence)).map(([key, value]) => {
    const row = object(value);
    if (text(row.id) !== key) throw new WorkspaceProblem("invalid");
    text(row.source_id);
    text(row.quote);
    if (
      !["caption", "transcript", "comment", "on_screen_text"].includes(
        text(row.channel),
      )
    )
      throw new WorkspaceProblem("invalid");
    return row;
  });
}
function referencedSources(report: JsonObject): string[] {
  const ids = new Set(evidenceRows(report).map((row) => text(row.source_id)));
  for (const key of ["products", "top_contents"])
    for (const row of reportRows(report, key)) ids.add(text(row.source_id));
  for (const row of reportRows(report, "repeatable_formats"))
    for (const id of strings(row.supporting_contents)) ids.add(id);
  for (const group of reportRows(report, "price_comparison"))
    for (const row of rows(group.rows)) ids.add(text(row.source_id));
  return [...ids];
}

function mapReport(
  current: Analysis,
  observed: Map<string, ObservedSource | null>,
): BenchmarkReport {
  const raw = current.report!;
  if (raw.kind !== current.request.kind) throw new WorkspaceProblem("invalid");
  const coverage = object(raw.coverage);
  const collected = count(coverage.collected);
  const extracted = count(coverage.extracted);
  const failed = count(coverage.extraction_failed);
  const rejected = count(coverage.quotes_rejected);
  const pricesRejected = count(coverage.prices_rejected);
  const limitations = [...strings(coverage.warnings)];
  limitations.push(
    "Only source accounts referenced in this report are shown. Their count is not the total number of accounts collected.",
    "Publication and collection windows were not provided by the API.",
  );
  if (failed)
    limitations.push(`${failed} collected posts could not be extracted.`);
  if (rejected)
    limitations.push(`${rejected} quotes were rejected during validation.`);
  if (pricesRejected)
    limitations.push(
      `${pricesRejected} prices were rejected during validation.`,
    );
  const missing = [...observed.values()].filter(
    (value) => value === null,
  ).length;
  if (missing)
    limitations.push(`${missing} referenced sources are no longer available.`);
  const restaurants = object(raw.restaurants);
  for (const name of Object.values(restaurants)) text(name);
  const evidence = new Map(
    evidenceRows(raw).map((item) => [text(item.id), item]),
  );
  function sourceFor(id: string, quote?: JsonObject): Source {
    const known = observed.get(id)?.source;
    const fallbackPlatform = current.request.platforms.find((item) =>
      id.startsWith(`${item}:`),
    );
    if (!known && !fallbackPlatform) throw new WorkspaceProblem("invalid");
    const source: Source = known
      ? { ...known }
      : {
          id,
          snapshotId: current.id,
          title: "Unavailable source",
          platform: fallbackPlatform!,
          author: null,
          publishedAt: null,
          observedAt: null,
          url: null,
          excerpt: null,
          evidenceType: null,
          timestampSeconds: null,
          availability: "unavailable",
        };
    if (quote) {
      const channel = text(quote.channel);
      source.evidenceType = channel as
        "caption" | "transcript" | "comment" | "on_screen_text";
      source.excerpt = text(quote.quote);
      source.evidenceId = text(quote.id);
      source.url ??= safeSourceUrl(nullableText(quote.post_url));
    }
    return source;
  }
  function cited(row: JsonObject): Source[] {
    return strings(row.evidence_ids).map((id) => {
      const quote = evidence.get(id);
      if (!quote) throw new WorkspaceProblem("invalid");
      return sourceFor(text(quote.source_id), quote);
    });
  }
  const findings: Finding[] = [];
  for (const row of reportRows(raw, "opportunities")) {
    findings.push({
      id: text(row.id),
      title: text(row.title),
      description: [
        text(row.observation),
        `Hypothesis: ${text(row.hypothesis)}`,
        `Proposed action: ${text(row.proposed_action)}`,
        `Effort: ${text(row.effort)}. Measure: ${text(row.outcome_measure)}`,
      ].join("\n\n"),
      count: null,
      denominator: null,
      sources: cited(row),
      limitations: text(row.limitations) ? [text(row.limitations)] : [],
    });
  }
  for (const [index, row] of reportRows(raw, "aspects").entries()) {
    const name = text(restaurants[text(row.restaurant_id)]);
    findings.push({
      id: `aspect-${index}`,
      title: `${name}: ${text(row.aspect).replaceAll("_", " ")} (${text(row.polarity)})`,
      description: `${count(row.count)} observed mentions in the extracted content. These are not a customer satisfaction survey.`,
      count: null,
      denominator: null,
      sources: cited(row),
      limitations: [],
    });
  }
  for (const [index, row] of reportRows(raw, "products").entries()) {
    const amount = nullableText(row.price_amount);
    const currency = nullableText(row.currency);
    findings.push({
      id: `product-${index}`,
      title: text(row.label),
      description:
        amount === null
          ? "Product observed. No advertised price was extracted."
          : `Advertised price in the source: ${amount}${currency ? ` ${currency}` : " (currency not provided)"}.`,
      count: null,
      denominator: null,
      sources: cited(row),
      limitations: ["An advertised price is not a current menu price."],
    });
  }
  for (const row of reportRows(raw, "top_contents")) {
    const id = text(row.source_id);
    findings.push({
      id: `top-${id}`,
      title: `Most viewed in the collected corpus: #${count(row.rank)}`,
      description: `${platformLabel(platform(row.platform))}: ${count(row.views).toLocaleString("en-GB")} cumulative views observed on ${date(row.fetched_at)}.`,
      count: null,
      denominator: null,
      sources: [sourceFor(id)],
      limitations: [
        "Cumulative views are not growth or evidence of visits or sales.",
      ],
    });
  }
  const comparison: BenchmarkReport["comparison"] = Object.entries(
    restaurants,
  ).map(([id, name]) => ({
    restaurantId: id,
    name: text(name),
    isOwn: current.request.kind === "benchmark" && id === "r0",
    metrics: {},
  }));
  let partialViewCounts = false;
  for (const row of reportRows(raw, "stats")) {
    const target = comparison.find(
      (item) => item.restaurantId === text(row.restaurant_id),
    );
    if (!target) throw new WorkspaceProblem("invalid");
    const key = platform(row.platform);
    if (target.metrics[key]) throw new WorkspaceProblem("invalid");
    const contentsWithViews = count(row.contents_with_views);
    const contentCount = count(row.content_count);
    if (contentsWithViews > contentCount) throw new WorkspaceProblem("invalid");
    if (contentsWithViews < contentCount) {
      partialViewCounts = true;
      limitations.push(
        `${target.name} on ${platformLabel(key)}: view counters were available for ${contentsWithViews} of ${contentCount} collected posts. Cumulative views sum only available counters.`,
      );
    }
    target.metrics[key] = {
      posts: count(row.content_count),
      views: nullableCount(row.cumulative_views),
    };
  }
  const incomplete =
    failed > 0 ||
    rejected > 0 ||
    pricesRejected > 0 ||
    extracted < collected ||
    missing > 0 ||
    partialViewCounts ||
    strings(coverage.warnings).length > 0;
  const ownCounts = comparison.find((item) => item.isOwn)?.metrics;
  const ownPostCount =
    ownCounts &&
    current.request.platforms.every((key) => ownCounts[key]?.posts != null)
      ? current.request.platforms.reduce(
          (total, key) => total + ownCounts[key]!.posts!,
          0,
        )
      : null;
  return {
    id: current.id,
    createdAt: date(raw.created_at),
    publicationWindow: { startAt: "", endAt: "" },
    collectionWindow: { startAt: "", endAt: "" },
    platforms: current.request.platforms,
    status: incomplete ? "partial" : "succeeded",
    coverage: collected === 0 ? "empty" : incomplete ? "partial" : "available",
    limitations,
    distinctPostCount: collected,
    distinctAccountCount: null,
    ownPostCount,
    ownerAuthoredCount: null,
    thirdPartyCount: null,
    comparison,
    findings,
    configurationSnapshot: {
      restaurantName:
        current.request.kind === "benchmark"
          ? current.request.restaurant.name
          : current.request.niche,
      businessGoals:
        current.request.kind === "benchmark" ? current.request.goals : [],
      targetCustomers: [],
      constraints:
        current.request.kind === "benchmark" &&
        current.request.constraints.length
          ? current.request.constraints.join("; ")
          : null,
    },
  };
}

function creators(
  observed: Map<string, ObservedSource | null>,
  raw: JsonObject,
): CreatorProfile[] {
  const result = new Map<string, CreatorProfile>();
  const restaurants = object(raw.restaurants);
  for (const value of observed.values()) {
    if (!value?.source.author) continue;
    const { source, followers, restaurantIds } = value;
    const handle = source.author!.replace(/^@/, "");
    const id = `${source.platform}:${handle.toLowerCase()}`;
    let creator = result.get(id);
    if (!creator) {
      creator = {
        id,
        displayName: `@${handle}`,
        handle: `@${handle}`,
        platform: source.platform,
        profileLocation: null,
        audienceLocation: null,
        followerCount: null,
        followersObservedAt: null,
        postCount: null,
        topics: [],
        coveredRestaurants: [],
        sources: [],
        selectionReason:
          "Authored a source referenced in this report. This is not a suitability recommendation.",
        selection: { creatorId: id, selected: false, revision: 0 },
      };
      result.set(id, creator);
    }
    creator.sources.push(source);
    if (
      followers !== null &&
      (!creator.followersObservedAt ||
        source.observedAt! > creator.followersObservedAt)
    ) {
      creator.followerCount = followers;
      creator.followersObservedAt = source.observedAt;
    }
    for (const rid of restaurantIds)
      if (
        typeof restaurants[rid] === "string" &&
        !creator.coveredRestaurants.some((item) => item.id === rid)
      )
        creator.coveredRestaurants.push({
          id: rid,
          name: text(restaurants[rid]),
        });
  }
  return [...result.values()];
}

/** The hackathon service exposes reads only for this interface; no paid analysis is started. */
export function createApiGateway(
  baseUrl: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): WorkspaceGateway {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    available: true,
    async load(signal) {
      async function get(path: string, allowMissing = false): Promise<unknown> {
        const response = await fetchImpl(`${base}${path}`, {
          signal,
          cache: "no-store",
        });
        if (response.status === 404 && allowMissing) return null;
        if (!response.ok)
          throw new WorkspaceProblem(
            "unknown",
            `The analysis service returned HTTP ${response.status}. Please try again.`,
          );
        return response.json();
      }
      const analyses = array(await get("/analyses"))
        .map(analysis)
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt),
        );
      const latest = analyses[0];
      const empty: WorkspaceSnapshot = {
        workspace: { id: "api", name: "ViralEat" },
        restaurant: latest ? profile(latest.request) : null,
        report: null,
        analysis: latest
          ? {
              id: latest.id,
              status: (latest.status === "done"
                ? "succeeded"
                : latest.status) as AnalysisStatus,
              stage:
                latest.status === "failed"
                  ? "The analysis failed before a report could be completed."
                  : latest.stage,
            }
          : null,
        creators: [],
        permissions: { editRestaurant: false, selectCreators: false },
      };
      if (!latest) return empty;
      const successful = analyses.find(
        (item) =>
          item.status === "done" &&
          item.report !== null &&
          scopeKey(item.request) === scopeKey(latest.request),
      );
      if (!successful) return empty;
      const ids = referencedSources(successful.report!);
      const observed = new Map<string, ObservedSource | null>();
      let index = 0;
      async function worker() {
        while (index < ids.length) {
          const id = ids[index++];
          const payload = await get(`/sources/${encodeURIComponent(id)}`, true);
          observed.set(
            id,
            payload === null
              ? null
              : observedSource(payload, id, successful!.id),
          );
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(4, ids.length) }, worker),
      );
      // Restore report order independently of network response order.
      const ordered = new Map(ids.map((id) => [id, observed.get(id)!]));
      return {
        ...empty,
        report: mapReport(successful, ordered),
        creators: creators(ordered, successful.report!),
      };
    },
    async saveRestaurant() {
      throw new WorkspaceProblem("forbidden");
    },
    async setCreatorSelection() {
      throw new WorkspaceProblem("forbidden");
    },
  };
}

export const apiGateway = createApiGateway(
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://viral-eat-api-mu.vercel.app",
);
