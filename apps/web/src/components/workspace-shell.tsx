"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { initials } from "@/lib/format";

const navigation = [
  { href: "/dashboard/", label: "Overview" },
  { href: "/restaurant/", label: "Restaurant profile" },
  { href: "/creators/", label: "Creator profiles" },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activePath =
    pathname === "/" ? "/dashboard" : pathname.replace(/\/$/, "");
  const { state, reload } = useWorkspace();
  const workspace = state.data?.workspace;
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="header">
        <Link
          className="brand"
          href="/dashboard/"
          aria-label="ViralEat overview"
        >
          <img
            className="brand-image"
            src="/Vertical%20Lockup%20on%20White%20Background.png"
            width={2000}
            height={2000}
            alt=""
          />
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={
                activePath === href.replace(/\/$/, "") ? "page" : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="workspace">
        <div className="workspace-label">
          <span className="mini-avatar" aria-hidden="true">
            {workspace ? initials(workspace.name) : "VE"}
          </span>
          <span className="workspace-title">
            {workspace?.name ?? "Your workspace"}
          </span>
        </div>
        <span className="small muted" role="status">
          {state.status === "ready"
            ? "Connected"
            : state.status === "loading"
              ? "Loading…"
              : state.status === "error"
                ? "Could not load"
                : "Not connected"}
        </span>
      </div>
      <main id="main-content" tabIndex={-1}>
        {state.status === "ready" && (
          <div className="state-control">
            <button className="button secondary" onClick={reload}>Refresh data</button>
          </div>
        )}
        {children}
      </main>
      <footer className="footer">
        <p>
          Reports reflect collected content. Market coverage may be incomplete.
        </p>
      </footer>
    </div>
  );
}
