import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestaurantProfilePage } from "../src/components/restaurant-profile";
import { CreatorProfilePage } from "../src/components/creator-profile";
import { WorkspaceProvider } from "../src/lib/workspace-context";
import { createStudyGateway } from "../src/lib/study-gateway";
import { studyProfiles } from "../src/lib/study-profiles";

// Saved real provider export. These checks do not call a live provider.
const example = JSON.parse(readFileSync(resolve(process.cwd(), "../../examples/tasty-crousty/study_output.json"), "utf8"));

describe("study profiles", () => {
  it("uses the own brand and explicit study context without a fabricated Paris location", () => {
    const { restaurant } = studyProfiles(example);
    expect(restaurant?.name).toBe("Tasty Crousty");
    expect(restaurant?.city).toBeNull();
    expect(restaurant?.socialAccounts).toEqual([{ platform: "instagram", handle: "@tastycrousty", url: "https://www.instagram.com/tastycrousty/" }]);
    expect(restaurant?.businessGoals).toEqual(example.benchmark.configuration_snapshot.goals);
    expect(restaurant?.targetCustomers).toEqual([]);
    expect(restaurant?.testBudget).toBeNull();
  });

  it("groups actual source authors and deduplicates posts shared by both corpora", () => {
    const { creators } = studyProfiles(example);
    const sources = [...example.benchmark.sources, ...example.market.sources];
    for (const creator of creators) {
      const observed = sources.filter(row => row.platform === creator.platform && `@${row.handle}` === creator.handle);
      expect(creator.postCount).toBe(new Set(observed.map(row => row.source_id)).size);
      expect(creator.sources.every(source => source.snapshotId === `study:${example.generated_at}`)).toBe(true);
      expect(creator.profileLocation).toBeNull();
      expect(creator.audienceLocation).toBeNull();
      expect(creator.selection.selected).toBe(false);
      expect(creator.selectionReason).toContain("rather than an individual creator");
    }
    const own = creators.find(creator => creator.handle === "@tastycrousty");
    expect(own?.followerCount).toBe(112324);
    expect(own?.followersObservedAt).toBeTruthy();
    expect(own?.sources[0].url).toBe("https://www.instagram.com/p/DfCR-lNsOpM/");
    expect(creators.some(creator => creator.handle === "@gradi_sp")).toBe(false);
  });

  it("does not infer identities from malformed rows or unsafe handles and URLs", () => {
    expect(studyProfiles(null)).toEqual({ restaurant: null, creators: [] });
    expect(studyProfiles({ benchmark: { own_accounts: "bad", sources: [null, {}, { platform: "other", handle: "name", source_id: "x" }] } })).toEqual({ restaurant: null, creators: [] });
    const mapped = studyProfiles({ generated_at: "invalid", benchmark: { configuration_snapshot: { own_restaurant: { name: "Brand", accounts: [{ platform: "instagram", handle: "../evil" }] } }, sources: [{ platform: "instagram", handle: "brand", source_id: "x", external_url: "javascript:alert(1)", followers: -2 }] } });
    expect(mapped.restaurant?.socialAccounts).toEqual([]);
    expect(mapped.creators[0].sources[0].url).toBeNull();
    expect(mapped.creators[0].followerCount).toBeNull();
  });

  it("keeps the latest dated follower observation even when an earlier source arrives last", () => {
    const row = { source_id: "x", platform: "instagram", handle: "brand" };
    const { creators } = studyProfiles({ benchmark: { sources: [{ ...row, fetched_at: "2026-11-07T12:00:00Z", followers: 10 }] }, market: { sources: [{ ...row, fetched_at: "2026-11-06T12:00:00Z", followers: 5 }] } });
    expect(creators[0].followerCount).toBe(10);
    expect(creators[0].postCount).toBe(1);
    expect(creators[0].sources[0].observedAt).toBe("2026-11-07T12:00:00Z");
  });
});


it("renders restaurant facts and source author evidence through the study gateway", async () => {
  const gateway = createStudyGateway(undefined, vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(example))));
  render(createElement(WorkspaceProvider, { gateway, children: createElement("div", null, createElement(RestaurantProfilePage), createElement(CreatorProfilePage)) }));
  await screen.findByRole("heading", { name: "Restaurant details" });
  expect(screen.queryByText("No restaurant profile available")).toBeNull();
  expect((screen.getByRole("button", { name: "Edit profile" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Select creator" }) as HTMLButtonElement).disabled).toBe(true);
  const picker = screen.getByRole("combobox", { name: "Source author account" });
  await userEvent.selectOptions(picker, "instagram:kroustysabaidi.fr");
  expect(screen.getByRole("heading", { name: "Krousty Sabaidi®" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Review the creator evidence" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: /Open original source/ }).length).toBeGreaterThan(0);
});
