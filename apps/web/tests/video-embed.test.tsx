import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { videoEmbedUrl } from "../src/lib/video-embed";
import { StudySourceCard } from "../src/components/study-source-card";

it("builds allowlisted player URLs and rejects lookalike hosts and invalid paths", () => {
  expect(videoEmbedUrl("https://www.instagram.com/p/AbC-123/?igsh=tracking")?.url).toBe("https://www.instagram.com/p/AbC-123/embed/");
  expect(videoEmbedUrl("https://www.tiktok.com/@author/video/123456")?.url).toBe("https://www.tiktok.com/player/v1/123456?autoplay=0");
  for (const value of ["javascript:alert(1)", "https://instagram.com.evil.test/p/ABC/", "https://user:pass@instagram.com/p/ABC/", "https://instagram.com/profile/", "http://instagram.com/p/ABC/"]) expect(videoEmbedUrl(value)).toBeNull();
});

it("renders a lazy player with a persistent source link and a fallback for unsupported links", () => {
  const { rerender } = render(<StudySourceCard index={0} source={{ id: "example", title: "Synthetic post", handle: "example", views: 0, publishedAt: null, url: "https://www.instagram.com/p/AbC/" }} />);
  const frame = screen.getByTitle("Post 1 by @example on Instagram");
  expect(frame.getAttribute("loading")).toBe("lazy");
  expect(screen.getByRole("link", { name: /Open original post/ }).getAttribute("href")).toBe("https://www.instagram.com/p/AbC/");
  expect(screen.getByText("0")).toBeTruthy();
  rerender(<StudySourceCard index={0} source={{ id: "example", title: "Synthetic post", views: 0, publishedAt: null, url: "https://example.com/post" }} />);
  expect(screen.getByText("Preview unavailable.")).toBeTruthy();
  expect(screen.queryByTitle("Post 1 by @example on Instagram")).toBeNull();
});
