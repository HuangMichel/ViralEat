import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidenceDialog } from "@/components/evidence-dialog";
import {
  formatNumber,
  formatPublicationWindow,
  safeSourceUrl,
} from "@/lib/format";
import { source } from "./fixtures";

describe("evidence and measurement semantics", () => {
  it("does not expose removed content or unsafe links", () => {
    render(
      <EvidenceDialog
        open
        onClose={vi.fn()}
        title="Test evidence"
        sources={[
          source({
            availability: "removed",
            excerpt: "Removed private excerpt",
          }),
          source({ id: "unsafe", url: "javascript:alert(1)" }),
        ]}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Removed private excerpt")).toBeNull();
    expect(within(dialog).queryByRole("link")).toBeNull();
    expect(within(dialog).getByText(/Source removed/)).toBeTruthy();
  });

  it("removes an open excerpt immediately when its current record is removed", () => {
    const props = { open: true, onClose: vi.fn(), title: "Test evidence" };
    const { rerender } = render(
      <EvidenceDialog {...props} sources={[source()]} />,
    );
    expect(screen.getByRole("link")).toBeTruthy();
    rerender(
      <EvidenceDialog
        {...props}
        sources={[source({ availability: "removed" })]}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.queryByText("Synthetic caption used only in tests."),
    ).toBeNull();
  });

  it("shows unknown measurements without converting them to zero", () => {
    expect(formatNumber(null)).toBe("Not available");
    expect(formatNumber(undefined)).toBe("Not available");
    expect(formatNumber(0)).toBe("0");
  });

  it("formats exclusive publication boundaries across Paris daylight saving changes", () => {
    expect(
      formatPublicationWindow("2026-09-30T22:00:00Z", "2026-10-31T23:00:00Z"),
    ).toBe("1 Oct 2026 – 31 Oct 2026");
    expect(formatPublicationWindow("invalid", "2026-10-31T23:00:00Z")).toBe(
      "Period not available",
    );
  });

  it("accepts only http links without embedded credentials", () => {
    expect(safeSourceUrl("https://example.com/post")).toBe(
      "https://example.com/post",
    );
    expect(safeSourceUrl("https://user:secret@example.com/post")).toBeNull();
    expect(safeSourceUrl("data:text/html,test")).toBeNull();
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
  });
});
