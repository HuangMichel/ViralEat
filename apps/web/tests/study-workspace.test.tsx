import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Dashboard } from "../src/components/dashboard";
import { WorkspaceProvider, useWorkspace } from "../src/lib/workspace-context";
import { createStudyGateway } from "../src/lib/study-gateway";

function Refresh() {
  const { reload } = useWorkspace();
  return <button onClick={reload}>Refresh study</button>;
}

it("recovers from a missing export and retains the report with an alert on refresh failure", async () => {
  // Isolated synthetic HTTP fixture, not application data.
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("", { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ benchmark: {} })))
    .mockResolvedValueOnce(new Response("", { status: 500 }));
  render(<WorkspaceProvider gateway={createStudyGateway(undefined, fetcher)}><Refresh /><Dashboard /></WorkspaceProvider>);
  await screen.findByText(/Study data has not arrived/);
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Brand benchmark study" });
  expect(screen.queryByText("Start a new analysis")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Refresh study" }));
  expect((await screen.findByRole("alert")).textContent).toContain("HTTP 500");
  expect(screen.getByRole("heading", { name: "Brand benchmark study" })).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(3);
});
