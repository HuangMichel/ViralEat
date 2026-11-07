/** Synthetic requests and isolated gateways. These tests never use real providers. */
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalysisForm } from "@/components/analysis-form";
import { Dashboard } from "@/components/dashboard";
import { createApiGateway } from "@/lib/api-gateway";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace-context";
import {
  analysisScopeKey,
  type AnalysisRequest,
  type WorkspaceSnapshot,
  type WorkspaceGateway,
} from "@/lib/workspace-types";
import { WorkspaceProblem } from "@/lib/workspace-errors";
import { deferred, gateway as readGateway, snapshot } from "./fixtures";

function gateway(data = snapshot()) {
  return {
    ...readGateway(data),
    startAnalysis: vi.fn<NonNullable<WorkspaceGateway["startAnalysis"]>>(),
  };
}

const input: AnalysisRequest = {
  kind: "market",
  niche: "Synthetic niche",
  city: "Paris",
  topics: [],
  platforms: ["instagram", "tiktok"],
  languages: ["fr"],
  country: "France",
};
const accepted = {
  id: "synthetic-run",
  status: "running" as const,
  status_url: "/analyses/synthetic-run",
};

it("canonicalizes equivalent scope objects regardless of property or platform order", () => {
  expect(analysisScopeKey(input)).toBe(
    analysisScopeKey({
      country: "France",
      languages: ["fr"],
      platforms: ["tiktok", "instagram"],
      topics: [],
      city: "Paris",
      niche: "Synthetic niche",
      kind: "market",
    }),
  );
});

describe("analysis POST boundary", () => {
  it("sends one explicit JSON POST and validates the 202 acceptance contract", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(accepted), { status: 202 }),
      );
    const service = createApiGateway("https://synthetic.test/", fetcher);
    await expect(service.startAnalysis!(input)).resolves.toEqual({
      id: accepted.id,
      status: "running",
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://synthetic.test/analyses",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
  });

  it.each([
    [429, "already running"],
    [503, "not configured"],
    [422, "rejected"],
    [500, "may have started"],
  ])(
    "provides safe actionable HTTP %s feedback without retrying",
    async (status, message) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("private provider detail", { status }));
      await expect(
        createApiGateway("https://synthetic.test", fetcher).startAnalysis!(
          input,
        ),
      ).rejects.toThrow(message);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("explains ambiguous network failures and invalid success responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("private host"));
    const service = createApiGateway("https://synthetic.test", fetcher);
    await expect(service.startAnalysis!(input)).rejects.toThrow(
      "Refresh data before submitting again",
    );
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...accepted, status: "done" }), {
        status: 202,
      }),
    );
    await expect(service.startAnalysis!(input)).rejects.toThrow(
      "invalid acceptance response",
    );
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify(accepted), { status: 200 }),
    );
    await expect(service.startAnalysis!(input)).rejects.toThrow("HTTP 200");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

async function fillMarket() {
  const user = userEvent.setup();
  const summary = screen.getByText("Start a new analysis");
  if (!(summary.parentElement as HTMLDetailsElement).open)
    await user.click(summary);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Analysis type" }),
    "market",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Market niche" }),
    "Synthetic niche",
  );
  return user;
}

describe("analysis start interaction", () => {
  it("validates distinct competitors and nonempty platforms without posting", async () => {
    const service = gateway(snapshot());
    service.startAnalysis = vi.fn();
    render(
      <WorkspaceProvider gateway={service}>
        <AnalysisForm />
      </WorkspaceProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByText("Start a new analysis"));
    await user.type(
      screen.getByRole("textbox", { name: "Your restaurant" }),
      "Synthetic restaurant",
    );
    for (let i = 1; i <= 4; i++)
      await user.type(
        screen.getByRole("textbox", { name: `Competitor ${i}` }),
        "Same competitor",
      );
    await user.click(screen.getByRole("button", { name: "Start analysis" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("four distinct"),
    );
    expect(service.startAnalysis).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox"), "market");
    await user.type(
      screen.getByRole("textbox", { name: "Market niche" }),
      "Synthetic niche",
    );
    await user.click(screen.getByRole("checkbox", { name: "Instagram" }));
    await user.click(screen.getByRole("checkbox", { name: "TikTok" }));
    await user.click(screen.getByRole("button", { name: "Start analysis" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("at least one platform"),
    );
    expect(service.startAnalysis).not.toHaveBeenCalled();
  });

  it("preserves fields after a rejected submit and starts polling only after acceptance", async () => {
    const data = snapshot();
    data.analysisRequest = input;
    const service = gateway(data);
    const pending = deferred<{ id: string; status: "running" }>();
    const start = vi
      .fn()
      .mockRejectedValueOnce(
        new WorkspaceProblem("unknown", "An analysis is already running."),
      )
      .mockReturnValueOnce(pending.promise);
    service.startAnalysis = start;
    const done = deferred<WorkspaceSnapshot>();
    service.load.mockResolvedValueOnce(data).mockReturnValueOnce(done.promise);
    render(
      <WorkspaceProvider gateway={service} refreshIntervalMs={20}>
        <Dashboard />
      </WorkspaceProvider>,
    );
    await screen.findByText("Latest analysis failed");
    expect(start).not.toHaveBeenCalled();
    const user = await fillMarket();
    await user.click(screen.getByRole("button", { name: "Start analysis" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("already running"),
    );
    expect(
      screen.getByRole("textbox", { name: "Market niche" }),
    ).toHaveProperty("value", "Synthetic niche");
    await user.click(screen.getByRole("button", { name: "Start analysis" }));
    expect(
      screen.getByRole("button", { name: "Starting analysis…" }),
    ).toHaveProperty("disabled", true);
    await act(async () =>
      pending.resolve({ id: accepted.id, status: "running" }),
    );
    await screen.findByText("Analysis in progress");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(start).toHaveBeenLastCalledWith(input);
    await waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
    await act(async () =>
      done.resolve({
        ...data,
        analysis: { id: accepted.id, status: "succeeded", stage: "finished" },
      }),
    );
    await screen.findByText("Analysis complete");
    expect(
      screen.getByRole("button", { name: "Start analysis" }),
    ).toHaveProperty("disabled", false);
  });

  it("guards simultaneous submissions and clears a report from a different scope", async () => {
    const service = gateway();
    const pending = deferred<{ id: string; status: "running" }>();
    service.startAnalysis = vi.fn().mockReturnValue(pending.promise);
    const { result } = renderHook(useWorkspace, {
      wrapper: ({ children }) => (
        <WorkspaceProvider gateway={service}>{children}</WorkspaceProvider>
      ),
    });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const first = result.current.startAnalysis(input);
    act(() => result.current.reload());
    expect(service.load).toHaveBeenCalledTimes(1);
    await expect(result.current.startAnalysis(input)).rejects.toThrow(
      "already being started",
    );
    await act(async () => {
      pending.resolve({ id: accepted.id, status: "running" });
      await first;
    });
    expect(result.current.state.data?.analysis?.status).toBe("running");
    expect(result.current.state.data?.report).toBeNull();
    expect(result.current.state.data?.creators).toEqual([]);
    expect(service.startAnalysis).toHaveBeenCalledTimes(1);
  });

  it("keeps the report and form values when a background poll fails", async () => {
    const running = snapshot();
    running.analysis = {
      id: accepted.id,
      status: "running",
      stage: "collecting",
    };
    const service = gateway(running);
    service.startAnalysis = vi.fn();
    service.load
      .mockResolvedValueOnce(running)
      .mockRejectedValueOnce(new Error("private upstream"));
    render(
      <WorkspaceProvider gateway={service} refreshIntervalMs={20}>
        <Dashboard />
      </WorkspaceProvider>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Automatic refresh will try again");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Start analysis" }),
    ).toHaveProperty("disabled", true);
  });
});

it("retains an editable draft while Refresh data reloads after an ambiguous POST failure", async () => {
  const service = gateway();
  service.startAnalysis = vi
    .fn()
    .mockRejectedValue(
      new WorkspaceProblem(
        "unknown",
        "The analysis may have started. Refresh data before submitting again.",
      ),
    );
  const refreshed = deferred<WorkspaceSnapshot>();
  service.load
    .mockResolvedValueOnce(snapshot())
    .mockReturnValueOnce(refreshed.promise);
  function Refresh() {
    const { reload } = useWorkspace();
    return <button onClick={reload}>Refresh data</button>;
  }
  render(
    <WorkspaceProvider gateway={service}>
      <Dashboard />
      <Refresh />
    </WorkspaceProvider>,
  );
  await screen.findByText("Latest analysis failed");
  const user = await fillMarket();
  await user.click(screen.getByRole("button", { name: "Start analysis" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Refresh data" }));
  expect(screen.getByRole("textbox", { name: "Market niche" })).toHaveProperty(
    "value",
    "Synthetic niche",
  );
  await act(async () => refreshed.resolve(snapshot()));
  expect(screen.getByRole("textbox", { name: "Market niche" })).toHaveProperty(
    "value",
    "Synthetic niche",
  );
  expect(service.startAnalysis).toHaveBeenCalledTimes(1);
});

it("submits a benchmark with four distinct competitors and trimmed restaurant context", async () => {
  const service = gateway();
  service.startAnalysis = vi
    .fn()
    .mockResolvedValue({ id: accepted.id, status: "running" });
  render(
    <WorkspaceProvider gateway={service}>
      <AnalysisForm />
    </WorkspaceProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByText("Start a new analysis"));
  await user.type(
    screen.getByRole("textbox", { name: "Your restaurant" }),
    " Synthetic restaurant ",
  );
  const city = screen.getByRole("textbox", {
    name: "City (all five restaurants)",
  });
  await user.clear(city);
  await user.type(city, " Paris ");
  for (let i = 1; i <= 4; i++)
    await user.type(
      screen.getByRole("textbox", { name: `Competitor ${i}` }),
      ` Synthetic ${i} `,
    );
  await user.click(screen.getByRole("button", { name: "Start analysis" }));
  await screen.findByText(/Analysis accepted/);
  const restaurant = (name: string) => ({
    name,
    city: "Paris",
    district: null,
    handles: [],
  });
  expect(service.startAnalysis).toHaveBeenCalledWith({
    kind: "benchmark",
    restaurant: restaurant("Synthetic restaurant"),
    competitors: [1, 2, 3, 4].map((i) => restaurant(`Synthetic ${i}`)),
    platforms: ["instagram", "tiktok"],
    languages: ["fr"],
    country: "France",
    goals: [],
    constraints: [],
  });
});
