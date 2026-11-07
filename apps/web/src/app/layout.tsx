import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ConnectedWorkspace } from "@/lib/connected-workspace";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ViralEat", template: "%s | ViralEat" },
  description:
    "Restaurant profiles, creator evidence, and analytics from collected social content.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConnectedWorkspace>
          <WorkspaceShell>{children}</WorkspaceShell>
        </ConnectedWorkspace>
      </body>
    </html>
  );
}
