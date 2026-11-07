import { safeSourceUrl } from "./format";
import type { CreatorProfile, Platform, RestaurantProfile, Source } from "./workspace-types";

type Row = Record<string, unknown>;
function object(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}
function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => item !== null) : [];
}
function date(value: unknown): string | null {
  const result = text(value);
  return result && Number.isFinite(Date.parse(result)) ? result : null;
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function platform(value: unknown): Platform | null {
  return value === "instagram" || value === "tiktok" || value === "youtube" ? value : null;
}
function account(row: Row): { platform: Platform; handle: string; id: string } | null {
  const network = platform(row.platform);
  const handle = text(row.handle)?.replace(/^@/, "");
  if (!network || !handle || !/^(?=.*[a-zA-Z0-9_])[a-zA-Z0-9_.-]+$/.test(handle)) return null;
  return { platform: network, handle, id: `${network}:${handle.toLowerCase()}` };
}
function profileUrl(network: Platform, handle: string): string {
  const encoded = encodeURIComponent(handle);
  return network === "instagram" ? `https://www.instagram.com/${encoded}/`
    : network === "tiktok" ? `https://www.tiktok.com/@${encoded}`
      : `https://www.youtube.com/@${encoded}`;
}

/** Read-only presentation of supplied facts; query geography is not a brand location. */
export function studyProfiles(payload: unknown): { restaurant: RestaurantProfile | null; creators: CreatorProfile[] } {
  const root = object(payload);
  const benchmark = object(root.benchmark);
  const configuration = object(benchmark.configuration_snapshot);
  const own = object(configuration.own_restaurant);
  const ownAccounts = rows(benchmark.own_accounts);
  const allAccounts = [...ownAccounts, ...rows(benchmark.competitor_accounts)];
  const discoveries = rows(object(root.selection_basis).profiles);
  const name = text(own.name) ?? text(ownAccounts[0]?.restaurant);
  const scope = text(benchmark.benchmark_scope) ?? text(configuration.benchmark_scope);
  const socialAccounts = [...rows(own.accounts), ...ownAccounts]
    .map(account).filter((item): item is NonNullable<typeof item> => item !== null);
  const uniqueSocial = [...new Map(socialAccounts.map(item => [item.id, item])).values()];
  const restaurant: RestaurantProfile | null = name ? {
    id: `study:restaurant:${name}`,
    revision: 0,
    name,
    city: scope === "brand_accounts" ? null : text(own.city),
    competitiveArea: scope === "brand_accounts" ? "Brand accounts; no local branch verified" : null,
    category: null,
    positioning: null,
    businessGoals: strings(configuration.goals),
    targetCustomers: strings(configuration.target_customers),
    timeAvailable: null,
    testBudget: null,
    constraints: strings(configuration.constraints).join("; ") || null,
    socialAccounts: uniqueSocial.map(item => ({ platform: item.platform, handle: `@${item.handle}`, url: profileUrl(item.platform, item.handle) })),
  } : null;
  const snapshotId = `study:${date(root.generated_at) ?? "undated"}`;
  const creators = new Map<string, CreatorProfile>();
  const followerDates = new Map<string, number>();
  for (const row of [...rows(benchmark.sources), ...rows(object(root.market).sources)]) {
    const author = account(row);
    const sourceId = text(row.source_id);
    if (!author || !sourceId) continue;
    let creator = creators.get(author.id);
    if (!creator) {
      const discovery = discoveries.find(item => account(item)?.id === author.id);
      const associated = allAccounts.filter(item => account(item)?.id === author.id);
      const restaurantNames = [...new Set(associated.map(item => text(item.restaurant)).filter((item): item is string => item !== null))];
      creator = {
        id: author.id,
        displayName: text(discovery?.displayName) ?? restaurantNames[0] ?? `@${author.handle}`,
        handle: `@${author.handle}`,
        platform: author.platform,
        profileLocation: null,
        audienceLocation: null,
        followerCount: count(discovery?.followersCount),
        followersObservedAt: null,
        postCount: 0,
        topics: [],
        coveredRestaurants: restaurantNames.map(name => ({ id: `study:restaurant:${name}`, name })),
        sources: [],
        selectionReason: "Source author account in this study. It may represent a restaurant brand rather than an individual creator. This is not a collaboration recommendation.",
        selection: { creatorId: author.id, selected: false, revision: 0 },
      };
      creators.set(author.id, creator);
    }
    const observedAt = date(row.fetched_at);
    const followers = count(row.followers);
    const observedTime = observedAt ? Date.parse(observedAt) : -Infinity;
    if (followers !== null && observedTime > (followerDates.get(author.id) ?? -Infinity)) {
      creator.followerCount = followers;
      creator.followersObservedAt = observedAt;
      followerDates.set(author.id, observedTime);
    }
    const source: Source = {
      id: sourceId,
      snapshotId,
      title: `${creator.handle} · ${sourceId}`,
      platform: author.platform,
      author: creator.handle,
      publishedAt: date(row.published_at),
      observedAt,
      url: safeSourceUrl(text(row.external_url)),
      excerpt: null,
      evidenceType: null,
      timestampSeconds: null,
      availability: "available",
    };
    const previous = creator.sources.findIndex(item => item.id === sourceId);
    if (previous < 0) creator.sources.push(source);
    else {
      const previousObservedAt = creator.sources[previous].observedAt;
      if (observedAt && (!previousObservedAt || observedTime > Date.parse(previousObservedAt))) creator.sources[previous] = source;
    }
    creator.postCount = creator.sources.length;
  }
  return { restaurant, creators: [...creators.values()] };
}
