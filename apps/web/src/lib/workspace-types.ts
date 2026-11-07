/** Frontend presentation models. These are not HTTP payloads or backend schemas. */
export type Platform = "tiktok" | "instagram" | "youtube";

export type AnalysisStatus =
  | "pending_dispatch"
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";

export interface Source {
  id: string;
  evidenceId?: string;
  snapshotId: string;
  title: string;
  platform: Platform;
  author: string | null;
  publishedAt: string | null;
  observedAt: string | null;
  url: string | null;
  excerpt: string | null;
  evidenceType: "caption" | "transcript" | "comment" | "on_screen_text" | "visual" | null;
  timestampSeconds: number | null;
  availability: "available" | "unavailable" | "removed";
}

export interface Finding {
  id: string;
  title: string;
  description: string;
  count: number | null;
  denominator: number | null;
  sources: Source[];
  limitations: string[];
}

export interface RestaurantDraft {
  positioning: string;
  businessGoals: string[];
  targetCustomers: string[];
  timeAvailable: string;
  testBudget: string;
  constraints: string;
}

export interface RestaurantProfile {
  id: string;
  revision: number;
  name: string;
  city: string | null;
  competitiveArea: string | null;
  category: string | null;
  positioning: string | null;
  businessGoals: string[];
  targetCustomers: string[];
  timeAvailable: string | null;
  testBudget: string | null;
  constraints: string | null;
  socialAccounts: { platform: Platform; handle: string; url: string | null }[];
}

export interface ComparisonRow {
  restaurantId: string;
  name: string;
  isOwn: boolean;
  metrics: Partial<
    Record<Platform, { posts: number | null; views: number | null }>
  >;
}

export interface BenchmarkReport {
  id: string;
  createdAt: string;
  publicationWindow: { startAt: string; endAt: string };
  collectionWindow: { startAt: string; endAt: string };
  platforms: Platform[];
  status: "succeeded" | "partial";
  coverage: "available" | "partial" | "empty";
  limitations: string[];
  distinctPostCount: number | null;
  distinctAccountCount: number | null;
  ownPostCount: number | null;
  ownerAuthoredCount: number | null;
  thirdPartyCount: number | null;
  comparison: ComparisonRow[];
  findings: Finding[];
  configurationSnapshot: {
    restaurantName: string;
    businessGoals: string[];
    targetCustomers: string[];
    constraints: string | null;
  };
}

export interface CreatorSelection {
  creatorId: string;
  selected: boolean;
  revision: number;
}

export interface CreatorProfile {
  id: string;
  displayName: string;
  handle: string;
  platform: Platform;
  profileLocation: string | null;
  audienceLocation: string | null;
  followerCount: number | null;
  followersObservedAt: string | null;
  postCount: number | null;
  topics: string[];
  coveredRestaurants: { id: string; name: string }[];
  sources: Source[];
  selectionReason: string | null;
  selection: CreatorSelection;
}

export interface WorkspaceSnapshot {
  workspace: { id: string; name: string };
  restaurant: RestaurantProfile | null;
  report: BenchmarkReport | null;
  analysis: { id: string; status: AnalysisStatus; stage: string | null } | null;
  creators: CreatorProfile[];
  permissions: { editRestaurant: boolean; selectCreators: boolean };
}

/** Supply this boundary after authenticated response mapping is agreed. */
export interface WorkspaceGateway {
  available: boolean;
  load(signal: AbortSignal): Promise<WorkspaceSnapshot>;
  saveRestaurant(
    restaurantId: string,
    draft: RestaurantDraft,
    expectedRevision: number,
  ): Promise<RestaurantProfile>;
  setCreatorSelection(
    creatorId: string,
    selected: boolean,
    expectedRevision: number,
  ): Promise<CreatorSelection>;
}

export type WorkspaceState =
  | { status: "loading"; data: null; message: null }
  | { status: "unavailable" | "error"; data: null; message: string }
  | { status: "ready"; data: WorkspaceSnapshot; message: null };
