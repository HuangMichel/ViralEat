"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadingErrorMessage, WorkspaceProblem } from "./workspace-errors";
import { analysisScopeKey } from "./workspace-types";
import type {
  AnalysisRequest,
  RestaurantDraft,
  WorkspaceGateway,
  WorkspaceSnapshot,
  WorkspaceState,
} from "./workspace-types";

const disconnectedGateway: WorkspaceGateway = {
  available: false,
  async load() {
    throw new WorkspaceProblem("unavailable");
  },
  async saveRestaurant() {
    throw new WorkspaceProblem("unavailable");
  },
  async setCreatorSelection() {
    throw new WorkspaceProblem("unavailable");
  },
};

interface WorkspaceContextValue {
  state: WorkspaceState;
  reload: () => void;
  startAnalysis: (input: AnalysisRequest) => Promise<void>;
  canStartAnalysis: boolean;
  saveRestaurant: (draft: RestaurantDraft) => Promise<void>;
  setCreatorSelection: (creatorId: string, selected: boolean) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const loadingState: WorkspaceState = {
  status: "loading",
  data: null,
  message: null,
};

function initialState(gateway: WorkspaceGateway): WorkspaceState {
  return gateway.available
    ? loadingState
    : {
        status: "unavailable",
        data: null,
        message: new WorkspaceProblem("unavailable").message,
      };
}

export function WorkspaceProvider({
  children,
  gateway = disconnectedGateway,
  refreshIntervalMs = 0,
}: {
  children: ReactNode;
  gateway?: WorkspaceGateway;
  refreshIntervalMs?: number;
}) {
  const [record, setRecord] = useState(() => ({
    gateway,
    state: initialState(gateway),
  }));
  const epoch = useRef(0);
  const request = useRef<AbortController | null>(null);
  const pendingMutations = useRef(new Set<string>());
  // A changed service/session must never display the previous workspace while it loads.
  const state =
    record.gateway === gateway ? record.state : initialState(gateway);

  const refresh = useCallback(
    (background = false) => {
      request.current?.abort();
      const generation = ++epoch.current;
      const controller = new AbortController();
      request.current = controller;
      if (!background) {
        setRecord((current) =>
          current.gateway === gateway && current.state.status === "ready"
            ? current
            : { gateway, state: initialState(gateway) },
        );
      }
      if (!gateway.available) return;

      void Promise.resolve()
        .then(() => gateway.load(controller.signal))
        .then((data) => {
          if (controller.signal.aborted || generation !== epoch.current) return;
          setRecord({
            gateway,
            state: { status: "ready", data, message: null },
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || generation !== epoch.current) return;
          setRecord((current) => {
            if (
              current.gateway === gateway &&
              current.state.status === "ready"
            ) {
              return {
                gateway,
                state: {
                  ...current.state,
                  message: `${loadingErrorMessage(error)} ${background ? "Automatic refresh will try again." : "Use Refresh data to try again."}`,
                },
              };
            }
            return {
              gateway,
              state: {
                status:
                  error instanceof WorkspaceProblem &&
                  error.kind === "unavailable"
                    ? "unavailable"
                    : "error",
                data: null,
                message: loadingErrorMessage(error),
              },
            };
          });
        });
    },
    [gateway],
  );

  const reload = useCallback(() => {
    // A pending POST owns the next state transition. Do not invalidate its acceptance.
    if (!pendingMutations.current.has("analysis")) refresh();
  }, [refresh]);

  useEffect(() => {
    reload();
    return () => {
      request.current?.abort();
      epoch.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    if (
      refreshIntervalMs <= 0 ||
      state.status !== "ready" ||
      state.data.analysis?.status !== "running"
    )
      return;
    const timer = window.setTimeout(() => refresh(true), refreshIntervalMs);
    return () => window.clearTimeout(timer);
  }, [state, refresh, refreshIntervalMs]);

  function requireWorkspace(): WorkspaceSnapshot {
    if (state.status !== "ready") throw new WorkspaceProblem("unavailable");
    return state.data;
  }

  function updateSnapshot(
    workspaceId: string,
    update: (snapshot: WorkspaceSnapshot) => WorkspaceSnapshot,
  ) {
    setRecord((current) => {
      if (
        current.gateway !== gateway ||
        current.state.status !== "ready" ||
        current.state.data.workspace.id !== workspaceId
      )
        return current;
      return {
        gateway,
        state: {
          status: "ready",
          data: update(current.state.data),
          message: null,
        },
      };
    });
  }

  async function startAnalysis(input: AnalysisRequest) {
    const snapshot = requireWorkspace();
    if (!gateway.startAnalysis) throw new WorkspaceProblem("unavailable");
    if (
      pendingMutations.current.has("analysis") ||
      snapshot.analysis?.status === "running"
    )
      throw new WorkspaceProblem(
        "conflict",
        "An analysis is already being started or running.",
      );
    pendingMutations.current.add("analysis");
    // Invalidate reads started before this write so they cannot erase the accepted run.
    request.current?.abort();
    const generation = ++epoch.current;
    try {
      const accepted = await gateway.startAnalysis(input);
      if (generation !== epoch.current)
        throw new WorkspaceProblem(
          "expired",
          "The workspace changed. The analysis may have started. Refresh data before submitting again.",
        );
      const sameScope =
        snapshot.analysisRequest &&
        analysisScopeKey(snapshot.analysisRequest) === analysisScopeKey(input);
      updateSnapshot(snapshot.workspace.id, (current) => ({
        ...current,
        analysisRequest: input,
        analysis: { ...accepted, stage: "collecting" },
        restaurant:
          input.kind === "benchmark"
            ? {
                id: "r0",
                revision: 0,
                name: input.restaurant.name,
                city: input.restaurant.city,
                competitiveArea: input.restaurant.district,
                category: null,
                positioning: null,
                businessGoals: input.goals,
                targetCustomers: [],
                timeAvailable: null,
                testBudget: null,
                constraints: input.constraints.join("; ") || null,
                socialAccounts: [],
              }
            : null,
        report: sameScope ? current.report : null,
        creators: sameScope ? current.creators : [],
      }));
    } finally {
      pendingMutations.current.delete("analysis");
    }
  }

  async function saveRestaurant(draft: RestaurantDraft) {
    const snapshot = requireWorkspace();
    const restaurant = snapshot.restaurant;
    if (!snapshot.permissions.editRestaurant)
      throw new WorkspaceProblem("forbidden");
    if (!restaurant) throw new WorkspaceProblem("unavailable");
    const key = `restaurant:${restaurant.id}`;
    if (pendingMutations.current.has(key))
      throw new WorkspaceProblem("conflict");
    const generation = epoch.current;
    pendingMutations.current.add(key);
    try {
      const saved = await gateway.saveRestaurant(
        restaurant.id,
        draft,
        restaurant.revision,
      );
      if (generation !== epoch.current) throw new WorkspaceProblem("expired");
      if (
        saved.id !== restaurant.id ||
        !Number.isInteger(saved.revision) ||
        saved.revision < restaurant.revision
      ) {
        throw new WorkspaceProblem("invalid");
      }
      updateSnapshot(snapshot.workspace.id, (current) => ({
        ...current,
        restaurant: saved,
      }));
    } finally {
      pendingMutations.current.delete(key);
    }
  }

  async function setCreatorSelection(creatorId: string, selected: boolean) {
    const snapshot = requireWorkspace();
    if (!snapshot.permissions.selectCreators)
      throw new WorkspaceProblem("forbidden");
    const creator = snapshot.creators.find((item) => item.id === creatorId);
    if (!creator) throw new WorkspaceProblem("invalid");
    const key = `creator:${creatorId}`;
    if (pendingMutations.current.has(key))
      throw new WorkspaceProblem("conflict");
    const generation = epoch.current;
    pendingMutations.current.add(key);
    try {
      const selection = await gateway.setCreatorSelection(
        creatorId,
        selected,
        creator.selection.revision,
      );
      if (generation !== epoch.current) throw new WorkspaceProblem("expired");
      if (
        selection.creatorId !== creatorId ||
        selection.selected !== selected ||
        !Number.isInteger(selection.revision) ||
        selection.revision < creator.selection.revision
      ) {
        throw new WorkspaceProblem("invalid");
      }
      updateSnapshot(snapshot.workspace.id, (current) => ({
        ...current,
        creators: current.creators.map((item) =>
          item.id === creatorId ? { ...item, selection } : item,
        ),
      }));
    } finally {
      pendingMutations.current.delete(key);
    }
  }

  return (
    <WorkspaceContext.Provider
      value={{
        state,
        reload,
        startAnalysis,
        canStartAnalysis: Boolean(gateway.startAnalysis),
        saveRestaurant,
        setCreatorSelection,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace requires WorkspaceProvider");
  return context;
}
