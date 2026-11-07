"use client";

import type { ReactNode } from "react";
import { apiGateway } from "./api-gateway";
import { WorkspaceProvider } from "./workspace-context";

export function ConnectedWorkspace({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider gateway={apiGateway} refreshIntervalMs={5000}>
      {children}
    </WorkspaceProvider>
  );
}
