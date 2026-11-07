"""Study the most-viewed posts of a niche and write a Markdown + JSON report.

Usage:
  uv run python scripts/niche_study.py --term "poulet croustillant" --term tenders --term crousty [--n 50]

Costs: 1 content search, 1-3 profile searches, ~n + 5 OpenAI calls. Everything is cached afterwards.
"""

import argparse
import asyncio
from datetime import UTC, datetime
from pathlib import Path

from viraleat_api.config import ROOT, get_settings
from viraleat_api.extract import Extractor
from viraleat_api.niche import NicheReport, run_study
from viraleat_api.oriane import OrianeClient, post_url

PROFILE_URL = {"tiktok": "https://www.tiktok.com/@{}", "instagram": "https://www.instagram.com/{}/",
               "youtube": "https://www.youtube.com/@{}"}


def fmt(n: int | None) -> str:
    if n is None:
        return "n/d"
    return f"{n / 1e6:.1f} M" if n >= 1e6 else f"{n / 1e3:.0f} k" if n >= 1e3 else str(n)


def profile_link(r: NicheReport, handle: str) -> str:
    p = r.profiles.get(handle.casefold())
    url = PROFILE_URL.get(p.platform if p else "", "{}").format(handle)
    return f"[@{handle}]({url})"


def post_link(r: NicheReport, source_id: str) -> str:
    """`id` as a link to the post (link rebuilt from platform ids; Oriane does not return URLs)."""
    p = next((p for p in r.posts if p.source.id == source_id), None)
    url = post_url(p.source) if p else None
    return f"[`{source_id}`]({url})" if url else f"`{source_id}`"


def render(r: NicheReport) -> str:
    ev = r.evidence
    L = [f"# Niche study: {', '.join(r.niche_terms)}", "",
         f"_Generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC with `{r.model}` ({r.prompt_version}). "
         f"Scope: {r.scope}._", "",
         "> Views are observed counters on the most-viewed collected posts, not unique people, visits or sales. "
         "Oriane results are not a random sample of the market. Post links are rebuilt from platform ids.", "",
         "## Coverage", "",
         f"- Posts collected: **{r.collected}** ({', '.join(f'{k}: {v}' for k, v in r.platforms.items())})",
         f"- Relevant (about restaurant food, or published by / linked to a restaurant): **{r.relevant_found}**"
         f" → the **{r.about_restaurant_food}** most-viewed are analyzed below",
         f"- Off-topic, excluded: {r.collected - r.relevant_found}",
         f"- Analyzed posts linked to a restaurant profile: **{r.linked_to_restaurant_profile}**",
         f"- Tagged in Paris: {r.paris_located}",
         f"- Analyses failed: {r.extraction_failed} · LLM quotes rejected (not in source text): {r.quotes_rejected}", ""]
    if r.warnings:
        L += ["**Warnings**", ""] + [f"- {w}" for w in r.warnings] + [""]

    L += ["## Patterns", ""]
    if not r.patterns:
        L += ["_No pattern met the support threshold (≥ 2 posts from ≥ 2 creators)._", ""]
    for i, p in enumerate(r.patterns, 1):
        L += [f"### {i}. {p.title} _({p.pattern_type})_", "",
              f"**Observation.** {p.observation}", "", f"**Interpretation (hypothesis).** {p.interpretation}", "",
              f"**Test for a restaurant.** {p.how_a_restaurant_could_test_it}", "", f"**Limits.** {p.limitations}", "",
              "Evidence:"]
        for e in p.evidence_ids:
            L.append(f"- {post_link(r, ev[e].source_id)} [{ev[e].channel}] « {ev[e].quote[:160]} »")
        L.append("")

    def table(title, stats):
        out = [f"## {title}", "", "| Concept | Posts | Creators | Total views | Median views | Pattern? | Restaurants |",
               "|---|---|---|---|---|---|---|"]
        for c in stats:
            restos = ", ".join(profile_link(r, h) for h in c.restaurants[:4]) or "—"
            out.append(f"| {c.concept} | {c.posts} | {c.distinct_creators} | {fmt(c.total_views)} | "
                       f"{fmt(c.median_views)} | {'yes' if c.support_ok else 'single example'} | {restos} |")
        return out + [""]

    L += table("Marketing concepts", r.marketing)
    L += table("Restaurant concepts (posts + linked profile bios)", r.restaurant_concepts)

    L += ["## Restaurants linked to their profile", "",
          "| Profile | Name | Followers | Posts | Own account / third-party | Views | Marketing concepts | Concepts (bio) |",
          "|---|---|---|---|---|---|---|---|"]
    for s in r.restaurants:
        mk = ", ".join(f"{k} ×{v}" for k, v in sorted(s.marketing_concepts.items(), key=lambda kv: -kv[1]))
        L.append(f"| {profile_link(r, s.handle)} | {s.display_name or '—'} | {fmt(s.followers)} | {s.posts} | "
                 f"{s.own_account_posts} / {s.third_party_posts} | {fmt(s.total_views)} | {mk or '—'} | "
                 f"{', '.join(s.restaurant_concepts) or '—'} |")
    L.append("")

    if r.audio_groups:
        L += ["## Reused audio", ""]
        for g in r.audio_groups:
            L.append(f"- {g['platform']} audio `{g['audio_id']}` ({g['audio_title'] or 'untitled'}): "
                     f"{len(g['posts'])} posts, {g['distinct_creators']} creators")
        L.append("")

    L += ["## Who publishes what", "", "| Author | Posts | Distinct authors | Median views | Marketing concepts |",
          "|---|---|---|---|---|"]
    for a in r.by_author_type:
        mk = ", ".join(f"{k} ×{v}" for k, v in a.marketing_concepts.items()) or "—"
        L.append(f"| {a.author_type.replace('_', ' ')} | {a.posts} | {a.distinct_authors} | {fmt(a.median_views)} | {mk} |")
    L += ["", "_A restaurant controls what its own account publishes; it can only invite creators._", ""]

    L += ["## Analyzed posts", "", "| # | Post | Creator | Views | About resto food | Restaurant profiles | Marketing | Hook |",
          "|---|---|---|---|---|---|---|---|"]
    kept = set(r.kept_post_ids)
    ranked = sorted((p for p in r.posts if p.source.id in kept), key=lambda p: -(p.source.metrics.views or -1))
    for i, p in enumerate(ranked, 1):
        hook = ev[p.hook_evidence_id].quote[:70].replace("\n", " ").replace("|", "/") if p.hook_evidence_id else "—"
        restos = ", ".join(profile_link(r, h) for h in p.restaurant_handles) or (
            "name only: " + ", ".join(p.unlinked_restaurant_names) if p.unlinked_restaurant_names else "—")
        L.append(f"| {i} | {post_link(r, p.source.id)} | @{p.source.author_handle} | {fmt(p.source.metrics.views)} | "
                 f"{'yes' if p.about_restaurant_food else 'no'} | {restos} | {', '.join(p.marketing_concepts) or '—'} | {hook} |")
    return "\n".join(L) + "\n"


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--term", action="append", required=True)
    ap.add_argument("--platform", action="append", default=None)
    ap.add_argument("--n", type=int, default=50, help="Relevant posts to keep")
    ap.add_argument("--fetch", type=int, default=80, help="Posts fetched before filtering (max 100)")
    ap.add_argument("--city", default=None)
    args = ap.parse_args()

    settings = get_settings()
    oriane, extractor = OrianeClient(settings), Extractor(settings)
    try:
        report = await run_study(oriane, extractor, args.term, args.platform or ["tiktok", "instagram"],
                                 n_posts=args.n, city=args.city, fetch_n=args.fetch)
    finally:
        await oriane.aclose()

    out_dir = ROOT / "reports"
    out_dir.mkdir(exist_ok=True)
    stem = f"niche_{'_'.join(t.replace(' ', '-') for t in args.term[:3])}_{datetime.now(UTC):%Y%m%d}"
    (out_dir / f"{stem}.json").write_text(report.model_dump_json(indent=1))
    md = out_dir / f"{stem}.md"
    md.write_text(render(report))
    print(f"Report: {md}\nCollected {report.collected}, about food {report.about_restaurant_food}, "
          f"linked {report.linked_to_restaurant_profile}, patterns {len(report.patterns)}, "
          f"failed {report.extraction_failed}, quotes rejected {report.quotes_rejected}")


if __name__ == "__main__":
    asyncio.run(main())
