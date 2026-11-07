import type {
  Source,
  WorkspaceGateway,
  WorkspaceSnapshot,
} from "@/lib/workspace-types";
import { vi } from "vitest";

// Synthetic fixtures are only imported by tests, never by application routes.
export function source(overrides: Partial<Source> = {}): Source {
  return {
    id: "test-source-1",
    snapshotId: "test-snapshot-1",
    title: "Synthetic source one",
    platform: "tiktok",
    author: "Synthetic author",
    publishedAt: "2026-10-10T10:00:00Z",
    observedAt: "2026-11-01T08:00:00Z",
    url: "https://example.com/source-one",
    excerpt: "Synthetic caption used only in tests.",
    evidenceType: "caption",
    timestampSeconds: null,
    availability: "available",
    ...overrides,
  };
}

export function snapshot(): WorkspaceSnapshot {
  return {
    workspace: { id: "test-workspace", name: "Synthetic workspace" },
    restaurant: {
      id: "test-restaurant",
      revision: 4,
      name: "Synthetic restaurant",
      city: "Paris",
      competitiveArea: null,
      category: null,
      positioning: "Original positioning",
      businessGoals: ["Original goal"],
      targetCustomers: ["Declared test target"],
      timeAvailable: null,
      testBudget: null,
      constraints: null,
      socialAccounts: [],
    },
    report: {
      id: "test-report",
      createdAt: "2026-11-01T09:00:00Z",
      publicationWindow: {
        startAt: "2026-09-30T22:00:00Z",
        endAt: "2026-10-31T23:00:00Z",
      },
      collectionWindow: {
        startAt: "2026-11-01T08:00:00Z",
        endAt: "2026-11-01T08:15:00Z",
      },
      platforms: ["tiktok", "instagram"],
      status: "partial",
      coverage: "partial",
      limitations: ["Instagram counters were not returned."],
      distinctPostCount: 1,
      distinctAccountCount: 1,
      ownPostCount: 1,
      ownerAuthoredCount: 0,
      thirdPartyCount: 1,
      comparison: Array.from({ length: 5 }, (_, index) => ({
        restaurantId: `test-restaurant-${index}`,
        name: `Synthetic comparison ${index + 1}`,
        isOwn: index === 0,
        metrics: { tiktok: { posts: index === 0 ? 0 : null, views: null } },
      })),
      findings: [
        {
          id: "test-finding",
          title: "Synthetic observation",
          description: "A fixture observation.",
          count: 1,
          denominator: 1,
          sources: [source()],
          limitations: [],
        },
      ],
      configurationSnapshot: {
        restaurantName: "Original restaurant name",
        businessGoals: ["Snapshot goal"],
        targetCustomers: ["Snapshot target"],
        constraints: null,
      },
    },
    analysis: { id: "test-analysis", status: "failed", stage: null },
    creators: [
      {
        id: "test-creator",
        displayName: "Synthetic creator",
        handle: "@synthetic",
        platform: "tiktok",
        profileLocation: "Paris",
        audienceLocation: null,
        followerCount: null,
        followersObservedAt: null,
        postCount: 1,
        topics: ["Fixture topic"],
        coveredRestaurants: [
          { id: "test-restaurant", name: "Synthetic restaurant" },
        ],
        sources: [
          source(),
          source({
            id: "test-source-2",
            title: "Synthetic source two",
            url: null,
          }),
        ],
        selectionReason: "A fixture reason.",
        selection: { creatorId: "test-creator", selected: false, revision: 2 },
      },
    ],
    permissions: { editRestaurant: true, selectCreators: true },
  };
}

export function gateway(data = snapshot()) {
  return {
    available: true,
    load: vi.fn<WorkspaceGateway["load"]>().mockResolvedValue(data),
    saveRestaurant: vi.fn<WorkspaceGateway["saveRestaurant"]>(),
    setCreatorSelection: vi.fn<WorkspaceGateway["setCreatorSelection"]>(),
  } satisfies WorkspaceGateway;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
