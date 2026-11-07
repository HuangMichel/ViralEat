import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { type ReactNode } from "react";
import { Dashboard } from "@/components/dashboard";
import { RestaurantProfilePage } from "@/components/restaurant-profile";
import { CreatorProfilePage } from "@/components/creator-profile";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace-context";
import { WorkspaceProblem } from "@/lib/workspace-errors";
import { createApiGateway } from "@/lib/api-gateway";
import type {
  RestaurantDraft,
  WorkspaceGateway,
  WorkspaceSnapshot,
} from "@/lib/workspace-types";
import { deferred, gateway, snapshot, source } from "./fixtures";

const draft: RestaurantDraft = {
  positioning: "Updated positioning",
  businessGoals: ["Updated goal"],
  targetCustomers: [],
  timeAvailable: "",
  testBudget: "",
  constraints: "",
};

function wrapper(service: WorkspaceGateway) {
  return function Provider({ children }: { children: ReactNode }) {
    return <WorkspaceProvider gateway={service}>{children}</WorkspaceProvider>;
  };
}

describe("workspace data boundary", () => {
  it("shows a retry action when the connected API returns a server error", async () => {
    let calls = 0;
    const service = createApiGateway("https://api.example.test", async () => {
      calls += 1;
      return new Response("Server unavailable", { status: 500 });
    });
    render(<WorkspaceProvider gateway={service}><Dashboard /></WorkspaceProvider>);
    await screen.findByText(/HTTP 500/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(calls).toBe(2));
    await screen.findByText(/HTTP 500/);
  });

  it("refreshes a running analysis without hiding the last report and stops when done", async () => {
    const running = snapshot();
    running.analysis = { id: "running", status: "running", stage: "extracting" };
    const complete = { ...running, analysis: { id: "running", status: "succeeded" as const, stage: "finished" } };
    const service = gateway(running);
    const nextLoad = deferred<WorkspaceSnapshot>();
    service.load.mockResolvedValueOnce(running).mockReturnValueOnce(nextLoad.promise);
    const { result, unmount } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => (
        <WorkspaceProvider gateway={service} refreshIntervalMs={20}>{children}</WorkspaceProvider>
      ),
    });
    await waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
    expect(result.current.state.status).toBe("ready");
    expect(result.current.state.data?.report).toEqual(running.report);
    await act(async () => nextLoad.resolve(complete));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(service.load).toHaveBeenCalledTimes(2);
    expect(result.current.state.data?.analysis?.status).toBe("succeeded");
    unmount();
  });

  it("starts unavailable without a service or fictional runtime data", () => {
    render(
      <WorkspaceProvider>
        <Dashboard />
        <RestaurantProfilePage />
        <CreatorProfilePage />
      </WorkspaceProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Overview unavailable" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Restaurant profile unavailable" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Creator profiles unavailable" }),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Select creator" })).toBeNull();
    expect(screen.queryByText(/Synthetic/)).toBeNull();
  });

  it("discards a stale load after changing workspaces", async () => {
    const oldLoad = deferred<WorkspaceSnapshot>();
    const first = gateway();
    first.load.mockReturnValue(oldLoad.promise);
    const secondData = snapshot();
    secondData.workspace = { id: "second-workspace", name: "Second workspace" };
    const second = gateway(secondData);
    function WorkspaceName() {
      const { state } = useWorkspace();
      return <p>{state.data?.workspace.name ?? state.status}</p>;
    }
    const { rerender } = render(
      <WorkspaceProvider gateway={first}>
        <WorkspaceName />
      </WorkspaceProvider>,
    );
    await waitFor(() => expect(first.load).toHaveBeenCalledOnce());
    rerender(
      <WorkspaceProvider gateway={second}>
        <WorkspaceName />
      </WorkspaceProvider>,
    );
    await screen.findByText("Second workspace");
    await act(async () => oldLoad.resolve(snapshot()));
    expect(screen.queryByText("Synthetic workspace")).toBeNull();
    expect(first.load.mock.calls[0][0].aborted).toBe(true);
  });

  it("saves the current revision without rewriting the dated report", async () => {
    const data = snapshot();
    const service = gateway(data);
    service.saveRestaurant.mockResolvedValue({
      ...data.restaurant!,
      ...draft,
      revision: 5,
    });
    const { result } = renderHook(useWorkspace, { wrapper: wrapper(service) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(() => result.current.saveRestaurant(draft));
    expect(service.saveRestaurant).toHaveBeenCalledWith(
      "test-restaurant",
      draft,
      4,
    );
    expect(result.current.state.data?.restaurant?.revision).toBe(5);
    expect(result.current.state.data?.report).toEqual(data.report);
  });

  it("enforces mutation permissions before calling the service", async () => {
    const data = snapshot();
    data.permissions = { editRestaurant: false, selectCreators: false };
    const service = gateway(data);
    const { result } = renderHook(useWorkspace, { wrapper: wrapper(service) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await expect(result.current.saveRestaurant(draft)).rejects.toThrow(
      "permission",
    );
    await expect(
      result.current.setCreatorSelection("test-creator", true),
    ).rejects.toThrow("permission");
    expect(service.saveRestaurant).not.toHaveBeenCalled();
    expect(service.setCreatorSelection).not.toHaveBeenCalled();
  });

  it("rejects duplicate selection writes and waits for a confirmed result", async () => {
    const service = gateway();
    const pending = deferred<{
      creatorId: string;
      selected: boolean;
      revision: number;
    }>();
    service.setCreatorSelection.mockReturnValue(pending.promise);
    const { result } = renderHook(useWorkspace, { wrapper: wrapper(service) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const mutation = result.current.setCreatorSelection("test-creator", true);
    await expect(
      result.current.setCreatorSelection("test-creator", true),
    ).rejects.toThrow("changed");
    expect(service.setCreatorSelection).toHaveBeenCalledTimes(1);
    expect(result.current.state.data?.creators[0].selection.selected).toBe(
      false,
    );
    await act(async () => {
      pending.resolve({
        creatorId: "test-creator",
        selected: true,
        revision: 3,
      });
      await mutation;
    });
    expect(result.current.state.data?.creators[0].selection).toEqual({
      creatorId: "test-creator",
      selected: true,
      revision: 3,
    });
  });

  it("does not accept a mutation result after a reload", async () => {
    const data = snapshot();
    const service = gateway(data);
    const pending = deferred<NonNullable<WorkspaceSnapshot["restaurant"]>>();
    service.saveRestaurant.mockReturnValue(pending.promise);
    const { result } = renderHook(useWorkspace, { wrapper: wrapper(service) });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const mutation = result.current.saveRestaurant(draft);
    const rejection = expect(mutation).rejects.toThrow("workspace changed");
    act(() => result.current.reload());
    await waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
    await act(async () =>
      pending.resolve({ ...data.restaurant!, ...draft, revision: 5 }),
    );
    await rejection;
    expect(result.current.state.data?.restaurant?.positioning).toBe(
      "Original positioning",
    );
  });
});

describe("analytics and mutation screens", () => {
  it("offers workspace retry from the overview after a load failure", async () => {
    const user = userEvent.setup();
    const service = gateway();
    service.load.mockRejectedValueOnce(new Error("upstream failure"));
    render(<Dashboard />, { wrapper: wrapper(service) });
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(service.load).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("upstream failure")).toBeNull();
  });
  it("retains a report after a failed job and separates missing counters from observed zero", async () => {
    render(<Dashboard />, { wrapper: wrapper(gateway()) });
    await screen.findByText("Latest analysis failed");
    expect(
      screen.getByText("The last available report remains below."),
    ).toBeTruthy();
    expect(
      screen.getByText("Instagram counters were not returned."),
    ).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(within(table).getByText("0")).toBeTruthy();
    expect(within(table).getAllByText("Not available").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("1 Oct 2026 – 31 Oct 2026")).toBeTruthy();
  });

  it("hides report measurements when the collection is empty", async () => {
    const data = snapshot();
    data.report!.coverage = "empty";
    render(<Dashboard />, { wrapper: wrapper(gateway(data)) });
    await screen.findByRole("heading", {
      name: "No content found in this collection",
    });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Synthetic observation")).toBeNull();
  });

  it("retains form input after a conflict and shows success only after a later confirmed save", async () => {
    const user = userEvent.setup();
    const data = snapshot();
    const service = gateway(data);
    service.saveRestaurant.mockRejectedValueOnce(
      new WorkspaceProblem("conflict"),
    );
    render(<RestaurantProfilePage />, { wrapper: wrapper(service) });
    await user.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Positioning (optional)",
    });
    await user.clear(input);
    await user.type(input, "Revised test positioning");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect((input as HTMLTextAreaElement).value).toBe(
      "Revised test positioning",
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/Profile saved\./)).toBeNull();
    const saved = deferred<NonNullable<WorkspaceSnapshot["restaurant"]>>();
    service.saveRestaurant.mockReturnValueOnce(saved.promise);
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(
      (screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByText(/Profile saved\./)).toBeNull();
    await act(async () =>
      saved.resolve({
        ...data.restaurant!,
        positioning: "Revised test positioning",
        revision: 5,
      }),
    );
    expect(await screen.findByText(/Profile saved\./)).toBeTruthy();
    expect(screen.getByText("Goals: Snapshot goal")).toBeTruthy();
  });

  it("keeps a failed creator selection unchanged and conceals arbitrary service errors", async () => {
    const service = gateway();
    service.setCreatorSelection.mockRejectedValue(
      new Error("private upstream payload"),
    );
    const user = userEvent.setup();
    render(<CreatorProfilePage />, { wrapper: wrapper(service) });
    await user.click(
      await screen.findByRole("button", { name: "Select creator" }),
    );
    await screen.findByRole("alert");
    expect(
      screen
        .getByRole("button", { name: "Select creator" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.queryByText(/private upstream payload/)).toBeNull();
    expect(service.setCreatorSelection).toHaveBeenCalledWith(
      "test-creator",
      true,
      2,
    );
    expect(
      screen.getByText("Audience geography").nextElementSibling?.textContent,
    ).toContain("Unknown");
  });

  it("opens one selected source, then all creator evidence", async () => {
    const user = userEvent.setup();
    render(<CreatorProfilePage />, { wrapper: wrapper(gateway()) });
    await user.click(
      await screen.findByRole("button", { name: /Synthetic source one/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        level: 2,
        name: "Synthetic source one",
      }),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("heading", { name: "Synthetic source two" }),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Review the creator evidence" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Synthetic source two",
      }),
    ).toBeTruthy();
  });

  it("does not show claims whose only supporting sources were removed", async () => {
    const data = snapshot();
    data.report!.findings[0].sources = [source({ availability: "removed" })];
    data.creators[0].sources = [source({ availability: "removed" })];
    render(
      <>
        <Dashboard />
        <CreatorProfilePage />
      </>,
      { wrapper: wrapper(gateway(data)) },
    );
    await screen.findByRole("heading", { name: "Observation unavailable" });
    expect(screen.queryByText("Synthetic observation")).toBeNull();
    expect(screen.queryByText("A fixture observation.")).toBeNull();
    expect(screen.queryByText("Fixture topic")).toBeNull();
    expect(screen.queryByText("A fixture reason.")).toBeNull();
    expect(screen.getByRole("button", { name: /Source removed/ })).toBeTruthy();
  });

  it("opens exactly the clicked snapshot when a source has multiple snapshots", async () => {
    const user = userEvent.setup();
    const data = snapshot();
    data.creators[0].sources = [
      source(),
      source({ snapshotId: "test-snapshot-2", title: "Another snapshot" }),
    ];
    render(<CreatorProfilePage />, { wrapper: wrapper(gateway(data)) });
    await user.click(
      await screen.findByRole("button", { name: /Another snapshot/ }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByText("Source reference"));
    expect(within(dialog).getByText(/Snapshot: test-snapshot-2/)).toBeTruthy();
    expect(within(dialog).queryByText(/Snapshot: test-snapshot-1/)).toBeNull();
  });

  it("refreshes an open creator source from current availability", async () => {
    const user = userEvent.setup();
    const service = gateway();
    const { rerender } = render(
      <WorkspaceProvider gateway={service}>
        <CreatorProfilePage />
      </WorkspaceProvider>,
    );
    await user.click(
      await screen.findByRole("button", { name: /Synthetic source one/ }),
    );
    expect(within(screen.getByRole("dialog")).getByRole("link")).toBeTruthy();
    const refreshed = snapshot();
    refreshed.creators[0].sources[0].availability = "removed";
    rerender(
      <WorkspaceProvider gateway={gateway(refreshed)}>
        <CreatorProfilePage />
      </WorkspaceProvider>,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("link")).toBeNull();
    expect(
      within(dialog).queryByText("Synthetic caption used only in tests."),
    ).toBeNull();
    expect(within(dialog).getByText(/Source removed/)).toBeTruthy();
  });

  it("keeps read-only profiles inspectable without enabling edits", async () => {
    const data = snapshot();
    data.permissions.editRestaurant = false;
    render(<RestaurantProfilePage />, { wrapper: wrapper(gateway(data)) });
    const button = await screen.findByRole("button", { name: "Edit profile" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Synthetic restaurant" }),
    ).toBeTruthy();
  });
});
