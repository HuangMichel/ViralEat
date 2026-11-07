import { describe, expect, it, vi } from "vitest";
import { createApiGateway } from "@/lib/api-gateway";

// Synthetic backend payloads, isolated from application routes and provider data.
function request(name = "Synthetic restaurant") {
  return {
    kind: "benchmark",
    restaurant: { name, city: "Paris", district: null, handles: [] },
    competitors: ["A", "B", "C", "D"].map((name) => ({
      name,
      city: "Paris",
      district: null,
      handles: [],
    })),
    platforms: ["instagram", "tiktok"],
    languages: ["fr"],
    country: "France",
    goals: [],
    constraints: [],
  };
}
function report() {
  return {
    kind: "benchmark",
    created_at: "2026-11-01T10:00:00Z",
    coverage: {
      collected: 3,
      extracted: 3,
      extraction_failed: 0,
      quotes_rejected: 0,
      prices_rejected: 0,
      warnings: [],
    },
    restaurants: { r0: "Synthetic restaurant", r1: "A" },
    stats: [
      {
        restaurant_id: "r0",
        name: "Synthetic restaurant",
        platform: "instagram",
        content_count: 0,
        contents_with_views: 0,
        cumulative_views: null,
      },
      {
        restaurant_id: "r0",
        name: "Synthetic restaurant",
        platform: "tiktok",
        content_count: 2,
        contents_with_views: 1,
        cumulative_views: 0,
      },
    ],
    products: [],
    aspects: [],
    price_comparison: [],
    repeatable_formats: [],
    product_opportunities: [],
    top_contents: [
      {
        rank: 1,
        source_id: "tiktok:1",
        views: 0,
        fetched_at: "2026-11-01T09:00:00Z",
        platform: "tiktok",
      },
    ],
    evidence: {
      e1: {
        id: "e1",
        source_id: "tiktok:1",
        channel: "on_screen_text",
        quote: "Synthetic exact quote",
        post_url: null,
      },
    },
    opportunities: [
      {
        id: "o1",
        title: "Synthetic action",
        observation: "An observation",
        hypothesis: "A hypothesis",
        proposed_action: "An action",
        effort: "low",
        outcome_measure: "Observed measure",
        limitations: "Limited evidence",
        evidence_ids: ["e1"],
      },
    ],
  };
}
function analysis(overrides = {}) {
  return {
    id: "analysis-1",
    status: "done",
    request: request(),
    created_at: "2026-11-01T10:00:00Z",
    finished_at: "2026-11-01T10:01:00Z",
    progress: { phase: "finished" },
    report: report(),
    ...overrides,
  };
}
function source(overrides = {}) {
  return {
    id: "tiktok:1",
    platform: "tiktok",
    author_handle: "synthetic",
    author_followers: null,
    fetched_at: "2026-11-01T09:00:00Z",
    published_at: null,
    post_url: "https://example.com/post",
    url: null,
    caption: "Entire third party caption must not be copied",
    restaurant_ids: ["r0"],
    ...overrides,
  };
}
function mockFetch(
  analyses: unknown,
  sources: Record<string, unknown> = { "tiktok:1": source() },
) {
  return vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/analyses") return new Response(JSON.stringify(analyses));
    const id = decodeURIComponent(path.slice("/sources/".length));
    return sources[id]
      ? new Response(JSON.stringify(sources[id]))
      : new Response(null, { status: 404 });
  });
}
const signal = () => new AbortController().signal;

describe("read-only API gateway", () => {
  it("maps real contract fields without filling unknown counters or account totals", async () => {
    const fetcher = mockFetch([analysis()]);
    const snapshot = await createApiGateway(
      "https://synthetic.test/",
      fetcher,
    ).load(signal());
    expect(snapshot.permissions).toEqual({
      editRestaurant: false,
      selectCreators: false,
    });
    expect(snapshot.report).toMatchObject({
      distinctPostCount: 3,
      distinctAccountCount: null,
      ownPostCount: 2,
      ownerAuthoredCount: null,
      thirdPartyCount: null,
      publicationWindow: { startAt: "", endAt: "" },
    });
    expect(snapshot.report?.comparison[0].metrics).toEqual({
      instagram: { posts: 0, views: null },
      tiktok: { posts: 2, views: 0 },
    });
    expect(snapshot.report?.findings[0].sources[0]).toMatchObject({
      evidenceType: "on_screen_text",
      excerpt: "Synthetic exact quote",
      publishedAt: null,
    });
    expect(snapshot.report?.findings[1].sources[0].excerpt).toBeNull();
    expect(snapshot.report?.findings[0].sources[0].evidenceId).toBe("e1");
    expect(
      snapshot.report?.limitations.some((item) =>
        item.includes("1 of 2 collected posts"),
      ),
    ).toBe(true);
    expect(snapshot.creators[0]).toMatchObject({
      profileLocation: null,
      audienceLocation: null,
      followerCount: null,
      followersObservedAt: null,
      postCount: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(
        ([, init]) => !init?.method || init.method === "GET",
      ),
    ).toBe(true);
  });
  it("uses latest analysis and last completed report only within the same request", async () => {
    const old = analysis();
    const latest = analysis({
      id: "running",
      created_at: "2026-11-03T10:00:00Z",
      status: "running",
      report: null,
      progress: { phase: "extracting" },
    });
    const unrelated = analysis({
      id: "other",
      created_at: "2026-11-02T10:00:00Z",
      request: request("Other restaurant"),
    });
    const result = await createApiGateway(
      "https://synthetic.test",
      mockFetch([old, unrelated, latest]),
    ).load(signal());
    expect(result.analysis).toEqual({
      id: "running",
      status: "running",
      stage: "extracting",
    });
    expect(result.report?.id).toBe("analysis-1");
    const unmatched = await createApiGateway(
      "https://synthetic.test",
      mockFetch([unrelated, latest]),
    ).load(signal());
    expect(unmatched.report).toBeNull();
    expect(unmatched.creators).toEqual([]);
  });
  it("does not use a benchmark report for a newer market request", async () => {
    const market = analysis({
      created_at: "2026-11-03T10:00:00Z",
      status: "failed",
      report: null,
      request: {
        kind: "market",
        niche: "Synthetic niche",
        city: "Paris",
        topics: [],
        platforms: ["tiktok"],
        languages: ["fr"],
        country: "France",
      },
    });
    const result = await createApiGateway(
      "https://synthetic.test",
      mockFetch([analysis(), market]),
    ).load(signal());
    expect(result.restaurant).toBeNull();
    expect(result.report).toBeNull();
    expect(result.analysis?.status).toBe("failed");
  });
  it("returns honest empty snapshots and empty corpus coverage", async () => {
    const empty = await createApiGateway(
      "https://synthetic.test",
      mockFetch([]),
    ).load(signal());
    expect(empty).toMatchObject({
      restaurant: null,
      report: null,
      analysis: null,
      creators: [],
    });
    const raw = report();
    raw.coverage.collected = 0;
    raw.coverage.extracted = 0;
    raw.top_contents = [];
    raw.evidence = {} as typeof raw.evidence;
    raw.opportunities = [];
    const result = await createApiGateway(
      "https://synthetic.test",
      mockFetch([analysis({ report: raw })]),
    ).load(signal());
    expect(result.report).toMatchObject({
      coverage: "empty",
      distinctPostCount: 0,
      distinctAccountCount: null,
    });
  });
  it("retains missing evidence as unavailable and surfaces other source failures", async () => {
    const missing = await createApiGateway(
      "https://synthetic.test",
      mockFetch([analysis()], {}),
    ).load(signal());
    expect(missing.report?.findings[0].sources[0]).toMatchObject({
      availability: "unavailable",
      excerpt: "Synthetic exact quote",
    });
    expect(missing.report?.coverage).toBe("partial");
    expect(missing.creators).toEqual([]);
    const fetcher = mockFetch([analysis()]);
    fetcher
      .mockImplementationOnce(
        async () => new Response(JSON.stringify([analysis()])),
      )
      .mockImplementationOnce(async () => new Response(null, { status: 500 }));
    await expect(
      createApiGateway("https://synthetic.test", fetcher).load(signal()),
    ).rejects.toMatchObject({ kind: "unknown" });
  });
  it("rejects malformed payloads and all unsupported mutations", async () => {
    const gateway = createApiGateway(
      "https://synthetic.test",
      mockFetch({ items: [] }),
    );
    await expect(gateway.load(signal())).rejects.toMatchObject({
      kind: "invalid",
    });
    await expect(
      gateway.saveRestaurant(
        "r0",
        {
          positioning: "",
          businessGoals: [],
          targetCustomers: [],
          timeAvailable: "",
          testBudget: "",
          constraints: "",
        },
        0,
      ),
    ).rejects.toMatchObject({ kind: "forbidden" });
    await expect(
      gateway.setCreatorSelection("id", true, 0),
    ).rejects.toMatchObject({ kind: "forbidden" });
    const bad = source({ author_followers: -1 });
    await expect(
      createApiGateway(
        "https://synthetic.test",
        mockFetch([analysis()], { "tiktok:1": bad }),
      ).load(signal()),
    ).rejects.toMatchObject({ kind: "invalid" });
  });
  it("deduplicates all referenced sources and keeps identical handles separate by platform", async () => {
    const raw = report();
    raw.repeatable_formats.push({
      platform: "instagram",
      audio_id: "audio",
      supporting_contents: ["instagram:2", "tiktok:1"],
      distinct_creators: 2,
      hooks: [],
    } as never);
    const fetcher = mockFetch([analysis({ report: raw })], {
      "tiktok:1": source(),
      "instagram:2": source({
        id: "instagram:2",
        platform: "instagram",
        author_followers: 0,
      }),
    });
    const result = await createApiGateway(
      "https://synthetic.test",
      fetcher,
    ).load(signal());
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.creators).toHaveLength(2);
    expect(
      result.creators.find((creator) => creator.platform === "instagram")
        ?.followerCount,
    ).toBe(0);
  });
  it("bounds source concurrency and passes the cancellation signal to every read", async () => {
    const raw = report();
    raw.repeatable_formats = [
      {
        platform: "tiktok",
        audio_id: "synthetic-audio",
        supporting_contents: Array.from(
          { length: 9 },
          (_, index) => `tiktok:${index + 1}`,
        ),
        distinct_creators: 9,
        hooks: [],
      },
    ] as typeof raw.repeatable_formats;
    const controller = new AbortController();
    let active = 0;
    let maximum = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.signal).toBe(controller.signal);
      if (String(input).endsWith("/analyses"))
        return new Response(JSON.stringify([analysis({ report: raw })]));
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      const id = decodeURIComponent(
        new URL(String(input)).pathname.slice("/sources/".length),
      );
      return new Response(JSON.stringify(source({ id })));
    });
    await createApiGateway("https://synthetic.test", fetcher).load(
      controller.signal,
    );
    expect(maximum).toBe(4);
    expect(fetcher).toHaveBeenCalledTimes(10);
  });
  it("does not convert cancelled or network requests into empty successful data", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    await expect(
      createApiGateway("https://synthetic.test", fetcher).load(signal()),
    ).rejects.toMatchObject({ name: "AbortError" });
    fetcher.mockRejectedValueOnce(new TypeError("Network unavailable"));
    await expect(
      createApiGateway("https://synthetic.test", fetcher).load(signal()),
    ).rejects.toThrow("Network unavailable");
  });
  it("maps a successful market report without inventing a restaurant profile", async () => {
    const raw = { ...report(), kind: "market", restaurants: {}, stats: [] };
    const marketRequest = {
      kind: "market",
      niche: "Synthetic niche",
      city: "Paris",
      topics: ["Synthetic topic"],
      platforms: ["tiktok"],
      languages: ["fr"],
      country: "France",
    };
    const result = await createApiGateway(
      "https://synthetic.test",
      mockFetch([analysis({ request: marketRequest, report: raw })]),
    ).load(signal());
    expect(result.restaurant).toBeNull();
    expect(result.report).toMatchObject({
      platforms: ["tiktok"],
      comparison: [],
      ownPostCount: null,
      configurationSnapshot: { restaurantName: "Synthetic niche" },
    });
    expect(result.report?.findings[0].sources[0].excerpt).toBe(
      "Synthetic exact quote",
    );
    expect(result.creators[0].coveredRestaurants).toEqual([]);
  });
  it("labels aspect counts as mentions rather than distinct posts", async () => {
    const raw = report();
    raw.aspects = [
      {
        restaurant_id: "r0",
        aspect: "quality",
        polarity: "positive",
        count: 2,
        evidence_ids: ["e1"],
      },
    ] as typeof raw.aspects;
    const result = await createApiGateway(
      "https://synthetic.test",
      mockFetch([analysis({ report: raw })]),
    ).load(signal());
    const aspect = result.report?.findings.find(
      (item) => item.id === "aspect-0",
    );
    expect(aspect?.count).toBeNull();
    expect(aspect?.description).toContain("2 observed mentions");
  });
});
