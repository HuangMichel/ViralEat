import type { ReactNode } from "react";

export function StatusPanel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="empty-panel status-panel" aria-label={title}>
      <h2>{title}</h2>
      <div className="status-panel-copy">{children}</div>
      {action && <div className="status-panel-action">{action}</div>}
    </section>
  );
}
