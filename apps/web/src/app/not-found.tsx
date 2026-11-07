import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty-panel">
      <h1>Page not found</h1>
      <p>This page is not part of the current workspace.</p>
      <Link className="button" href="/dashboard/">
        Open analytics
      </Link>
    </section>
  );
}
