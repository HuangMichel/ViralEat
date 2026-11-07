"use client";

import type { ReactNode } from "react";
import { studyGateway } from "./study-gateway";
import { WorkspaceProvider } from "./workspace-context";

export function ConnectedWorkspace({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider gateway={studyGateway}>
      {children}
    </WorkspaceProvider>
  );
}
