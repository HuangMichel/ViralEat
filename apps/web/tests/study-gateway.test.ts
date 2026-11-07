import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { studyProfiles } from "../src/lib/study-profiles";
import { createStudyGateway, parseStudy } from "../src/lib/study-gateway";

// Read the real producer export without copying its private/raw fields into the app.
const fixture = (): Record<string, any> => JSON.parse(readFileSync(resolve(process.cwd(), "../../examples/tasty-crousty/study_output.json"), "utf8"));

describe("study export gateway", () => {
  it("maps the actual export and preserves unavailable full posting rates", () => {
    const study = parseStudy(fixture());
    expect(study.ownAccounts[0]).toMatchObject({ name: "Tasty Crousty", averageViews: 240840, medianViews: 240840, postsPerWeek: null });
    expect(study.ownAccounts[0].engagementRate).toBeCloseTo(3.535957);
    expect(study.ownAccounts[0].limitations).toContain("Provider indexing is not a complete account export.");
    expect(study.competitorAccounts).toHaveLength(4);
    expect(study.competitorAccounts[2].averageViews).toBeNull();
    expect(study.trends).toHaveLength(22);
    expect(study.productOpportunities).toHaveLength(3);
    expect(study.actions).toHaveLength(1);
    expect(study.sources).toHaveLength(11);
    expect(study.createdAt).toBe("2026-11-07T14:40:28.902223+00:00");
    expect(study.selectionBasis).toContain("User approved brand-account comparison");
    expect(study.selectionBasis).toContain("menu equivalence is a hypothesis");
    expect(study.periods).toEqual([
      { label: "Benchmark", startAt: "2026-10-01T00:00:00Z", endAt: "2026-10-30T00:00:00Z" },
      { label: "Market current", startAt: "2026-10-16T00:00:00Z", endAt: "2026-10-30T00:00:00Z" },
      { label: "Market previous", startAt: "2026-09-18T00:00:00Z", endAt: "2026-10-16T00:00:00Z" },
    ]);
  });
  it("preserves analysis consumption, partial coverage, AI failures and abstentions", () => {
    const study = parseStudy(fixture());
    expect(study.analyses[0]).toMatchObject({ id: "2557da21-c079-4f1c-99d3-2010edc911b7", status: "partial" });
    expect(study.analyses[0].consumption).toContain("Oriane requests: 5");
    expect(study.analyses[0].consumption).toContain("LLM tokens: 5412");
    expect(study.coverage.join("\n")).toContain("Benchmark · Tasty Crousty · instagram · Retained: 1 · Provider matches: 12");
    expect(study.coverage.join("\n")).toContain("Market · current · tiktok · Retained: 0 · Provider matches: 0");
    expect(study.coverage.join("\n")).toContain("AI_EVIDENCE_INVALID");
    expect(study.coverage.join("\n")).toContain("Price is not explicitly supported");
    expect(study.coverage.join("\n")).toContain("Ne pas généraliser");
    expect(study.peerComparison[0].measurements).toContainEqual({ label: "Peer median", value: "Not available" });
    expect(study.peerComparison[0].status).toBe("Not enough data");
    expect(study.trends[0].measurements).toContainEqual({ label: "Change", value: "Not available" });
    expect(study.trends[0].limitations?.join(" ")).toContain("too limited");
  });
  it("maps product prices, action evidence and required constraints without raw content", () => {
    const study = parseStudy(fixture());
    expect(study.productOpportunities[0].description).toContain("Price: 5 EUR");
    expect(study.productOpportunities[1].description).toContain("Price unavailable");
    expect(study.productOpportunities[0].limitations).toContain("Novelty is source-reported, not independent proof of a launch.");
    expect(study.actions[0].action).toContain("Uniquement si un objectif");
    expect(study.actions[0].sourceIds).toEqual(["instagram:DfCR-lNsOpM", "instagram:DfE4T6ZAGBS"]);
    expect(study.actions[0].limitations).toHaveLength(7);
    expect(study.sources[0]).toMatchObject({ title: "tastycrousty · instagram", url: "https://www.instagram.com/p/DfCR-lNsOpM/", observedAt: "2026-11-07T14:38:10.851451+00:00" });
    const serialized = JSON.stringify(study);
    expect(serialized).not.toContain('"caption"');
    expect(serialized).not.toContain('"provider_id"');
    expect(serialized).not.toContain('"bio"');
    expect(serialized).not.toContain("Les sans dents");
  });
  it("maps the sanitized public projection to the same presentation data", () => {
    const projection = JSON.parse(readFileSync(resolve(process.cwd(), "public/data/study_output.json"), "utf8"));
    expect(parseStudy(projection)).toEqual(parseStudy(fixture()));
    expect(studyProfiles(projection)).toEqual(studyProfiles(fixture()));
  });
  it("preserves measured zeros, fractional rates and meaningful negative changes", () => {
    const data = fixture();
    Object.assign(data.benchmark.own_accounts[0].metrics, { mean_views: 0, posts_per_week: 0.5 });
    data.market.trends[0].growth_percent = -25;
    const study = parseStudy(data);
    expect(study.ownAccounts[0]).toMatchObject({ averageViews: 0, postsPerWeek: 0.5 });
    expect(study.trends[0].measurements).toContainEqual({ label: "Change", value: "-25%" });
  });
  it("deduplicates shared source IDs and evidence while retaining distinct IDs and unresolved citations", () => {
    const data = fixture();
    data.market.sources.push({ ...data.benchmark.sources[0], source_id: "alias" });
    data.market.ai.actions[0].evidence.push({ source_id: "alias" }, { source_id: "missing" });
    const study = parseStudy(data);
    expect(study.sources).toHaveLength(12);
    expect(study.actions[0].sourceIds).toEqual(["instagram:DfCR-lNsOpM", "instagram:DfE4T6ZAGBS", "alias", "missing"]);
  });
  it("rejects malformed fields and does not invent missing sections", () => {
    expect(() => parseStudy({})).toThrow("expected format");
    expect(() => parseStudy({ benchmark: { own_accounts: [{ metrics: { mean_views: "0" } }] } })).toThrow();
    expect(() => parseStudy({ benchmark: {}, generated_at: "yesterday" })).toThrow();
    expect(() => parseStudy({ benchmark: { own_accounts: [{ metrics: { mean_views: -1 } }] } })).toThrow();
    expect(parseStudy({ benchmark: {} }).ownAccounts).toEqual([]);
  });
  it("removes unsafe source URLs", () => {
    expect(parseStudy({ market: { sources: [{ source_id: "x", external_url: "javascript:alert(1)" }] } }).sources[0].url).toBeNull();
  });
  it("fetches only the export, forwards cancellation and disables mutations", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(fixture())));
    const gateway = createStudyGateway("/data/study_output.json", fetcher);
    const signal = new AbortController().signal;
    const data = await gateway.load(signal);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/data/study_output.json", { signal, cache: "no-store" });
    expect(data.study?.sources).toHaveLength(11);
    expect(data.report).toBeNull();
    expect(gateway.startAnalysis).toBeUndefined();
    expect(data.permissions).toEqual({ editRestaurant: false, selectCreators: false });
    await expect(gateway.saveRestaurant("study", { positioning: "", businessGoals: [], targetCustomers: [], timeAvailable: "", testBudget: "", constraints: "" }, 1)).rejects.toThrow();
  });
  it.each([404, 500])("reports HTTP %s without fallback data", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status }));
    await expect(createStudyGateway(undefined, fetcher).load(new AbortController().signal)).rejects.toThrow(status === 404 ? "has not arrived" : "HTTP 500");
  });
  it("reports malformed JSON explicitly", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>"));
    await expect(createStudyGateway(undefined, fetcher).load(new AbortController().signal)).rejects.toThrow("expected format");
  });
});
