import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Dashboard } from "../src/components/dashboard";
import { WorkspaceProvider } from "../src/lib/workspace-context";
import { createStudyGateway, parseStudy } from "../src/lib/study-gateway";

// Real saved example, served through a substituted fetch. No live provider request.
const publicPayload = readFileSync(resolve(process.cwd(), "public/data/study_output.json"), "utf8");

it("loads the saved example into the dashboard without inventing missing KPIs", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(publicPayload));
  render(<WorkspaceProvider gateway={createStudyGateway(undefined, fetcher)}><Dashboard /></WorkspaceProvider>);
  await screen.findByRole("heading", { name: "Brand benchmark study" });
  const own = screen.getByRole("region", { name: "Your account measurements" });
  expect(within(own).getByText("Tasty Crousty")).toBeTruthy();
  expect(within(own).getAllByText("240,840")).toHaveLength(2);
  expect(within(own).getByText("Not available")).toBeTruthy();
  expect(screen.getAllByText("Status: partial")).toHaveLength(2);
  const actions = screen.getByRole("region", { name: "Recommended actions" });
  expect(within(actions).getByText(/Uniquement si un objectif/)).toBeTruthy();
  expect(within(actions).getAllByRole("link")).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: /Open original post/ })).toHaveLength(11);
  expect(screen.queryByText("Unresolved source reference:", { exact: false })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("publishes only the projection needed by the UI and preserves mapped results", () => {
  const original = JSON.parse(readFileSync(resolve(process.cwd(), "../../examples/tasty-crousty/study_output.json"), "utf8"));
  expect(parseStudy(JSON.parse(publicPayload))).toEqual(parseStudy(original));
  for (const field of ['"texts":', '"media":', '"bio":', '"export_directory":', '"quote":']) {
    expect(publicPayload).not.toContain(field);
  }
});
