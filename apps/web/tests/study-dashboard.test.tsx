import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StudyDashboard } from "@/components/study-dashboard";
import type { StudyData, StudyItem } from "@/lib/study-types";

// Synthetic study fixtures. These are not application or provider data.
function study(overrides: Partial<StudyData> = {}): StudyData {
  return {
    selectionBasis: null, createdAt: null, analyses: [], ownAccounts: [],
    competitorAccounts: [], peerComparison: [], coverage: [], trends: [],
    viralCandidates: [], repeatableFormats: [], productOpportunities: [],
    actions: [], sources: [], ...overrides,
  };
}

function item(overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    id: "synthetic-item", title: "Test a preparation close-up", description: null,
    hypothesis: null, action: null, effort: null, outcomeMeasure: null,
    sourceIds: [], ...overrides,
  };
}

describe("study dashboard", () => {
  it("identifies the brand scope and exposes missing coverage and sections", () => {
    render(<StudyDashboard study={study()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Brand benchmark study" })).toBeTruthy();
    expect(screen.getByText(/not a comparison of local Paris restaurants/)).toBeTruthy();
    expect(screen.getByText(/Provisional AI analysis/)).toBeTruthy();
    expect(screen.getByText("Coverage details were not supplied.")).toBeTruthy();
    expect(screen.getByText("Your account metrics are not available in this study.")).toBeTruthy();
    for (const title of ["Peer comparisons", "Market trends", "Viral candidates", "Repeatable formats", "Product opportunities", "Recommended actions", "Videos & sources"]) {
      expect(screen.getByRole("heading", { name: title, level: 2 })).toBeTruthy();
    }
    expect(screen.getByText(/No source records supplied/)).toBeTruthy();
  });

  it("preserves zero metrics and distinguishes unavailable values in both account tables", () => {
    const account = { name: "Synthetic brand", platform: "TikTok", averageViews: 0, medianViews: null, engagementRate: 0, postsPerWeek: null };
    render(<StudyDashboard study={study({ ownAccounts: [account], competitorAccounts: [{ ...account, name: "Synthetic peer", engagementRate: 4 }] })} />);
    const own = screen.getByRole("region", { name: "Your account measurements" });
    expect(screen.getByRole("region", { name: "Competitor account comparison" }).tabIndex).toBe(0);
    expect(within(own).getAllByText("0")).toHaveLength(1);
    expect(within(own).getByText("Average views")).toBeTruthy();
    expect(within(own).getAllByText("Not available")).toHaveLength(2);
    expect(within(own).getByText("0%")).toBeTruthy();
    expect(within(own).getByText("Posts / week")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Competitor account comparison" })).getByText("4%")).toBeTruthy();
  });

  it("links each source ID to one source record and reports unresolved references", () => {
    const source = { id: "synthetic/source", title: "Synthetic evidence", url: "https://example.com/evidence", publishedAt: null };
    render(<StudyDashboard study={study({ trends: [item({ sourceIds: [source.id, source.id, "missing"] })], sources: [source, { ...source, title: "Duplicate record" }] })} />);
    const reference = screen.getByRole("link", { name: "View post 1" });
    expect(reference.getAttribute("href")).toBe("#study-source-synthetic%2Fsource");
    expect(document.getElementById("study-source-synthetic/source")).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "Synthetic evidence" })).toHaveLength(1);
    expect(screen.queryByText("Duplicate record")).toBeNull();
    expect(screen.getByText("Supporting post unavailable")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open original post/ }).getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows named recommendation fields, warnings and text safely", () => {
    render(<StudyDashboard study={study({
      actions: [item({ title: "<img src=x onerror=alert(1)>", hypothesis: "Show preparation", action: "Record one clip", effort: "One hour", outcomeMeasure: "Compare median views" })],
      analyses: [{ id: "synthetic-analysis", status: "partial", createdAt: null, warnings: ["Limited sample"], consumption: "2 requests" }],
      sources: [{ id: "unsafe", title: "Unsafe URL", url: "javascript:alert(1)", publishedAt: null }],
    })} />);
    for (const label of ["Hypothesis", "Action", "Effort", "Outcome measure"]) expect(screen.getByText(label, { selector: "dt" })).toBeTruthy();
    expect(screen.getByText("Compare median views")).toBeTruthy();
    expect(screen.getByText("Limited sample")).toBeTruthy();
    expect(screen.getByText("Consumption: 2 requests")).toBeTruthy();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link", { name: /Open original post/ })).toBeNull();
    expect(screen.getByText("Source link unavailable.")).toBeTruthy();
  });

  it("keeps incomplete recommendation fields explicit", () => {
    render(<StudyDashboard study={study({ actions: [item()] })} />);
    const recommendations = screen.getByRole("region", { name: "Recommended actions" });
    expect(within(recommendations).getAllByText("Not supplied")).toHaveLength(4);
    expect(within(recommendations).getByText("No supporting sources supplied.")).toBeTruthy();
  });

  it("replaces prior study content when supplied data changes", () => {
    const { rerender } = render(<StudyDashboard study={study({ trends: [item()] })} />);
    expect(screen.getByRole("heading", { name: "Test a preparation close-up" })).toBeTruthy();
    rerender(<StudyDashboard study={study()} />);
    expect(screen.queryByRole("heading", { name: "Test a preparation close-up" })).toBeNull();
    expect(screen.getByText("No market trends supplied in this study.")).toBeTruthy();
  });
  it("shows six compact topics first and expands with an accessible control", async () => {
    render(<StudyDashboard study={study({ trends: Array.from({ length: 8 }, (_, index) => item({ id: `topic-${index}`, title: `Topic ${index + 1}`, measurements: [{ label: "Posts", value: "0" }] })) })} />);
    const topics = screen.getByRole("region", { name: "Market trends" });
    expect(within(topics).getAllByRole("heading", { level: 3 })).toHaveLength(6);
    const toggle = within(topics).getByRole("button", { name: "Show all 8 topics" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    expect(within(topics).getAllByRole("heading", { level: 3 })).toHaveLength(8);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(toggle);
    expect(within(topics).getAllByRole("heading", { level: 3 })).toHaveLength(6);
  });

  it("keeps provisional limits visible while collapsing technical and unavailable comparison details", () => {
    render(<StudyDashboard study={study({ peerComparison: [item({ status: "Not enough data", measurements: [{ label: "Own value", value: "0" }] })] })} />);
    expect(screen.getByText("Partial evidence, provisional conclusions")).toBeTruthy();
    expect(screen.getByText(/Insufficient data to calculate/)).toBeTruthy();
    for (const label of ["View comparison details", "Study scope, coverage, and analysis warnings"]) {
      expect(screen.getByText(label).closest("details")?.open).toBe(false);
    }
    expect(screen.getByText("Own value", { selector: "dt" })).toBeTruthy();
  });
});
