"""Run the real extraction on one restaurant's search results and print what survived validation.

Usage: uv run python scripts/probe_extract.py "Tasty Crousty" [--platform tiktok] [--limit 10]

The Oriane search is served from the disk cache when it was already run with the same arguments.
Costs up to <limit> OpenAI calls (cached afterwards).
"""

import argparse
import asyncio
import json

from viraleat_api import extract
from viraleat_api.config import get_settings
from viraleat_api.extract import ExtractionError, Extractor
from viraleat_api.oriane import OrianeClient, extract_items, normalize, restaurant_query


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("name")
    p.add_argument("--platform", default="tiktok")
    p.add_argument("--limit", type=int, default=10)
    args = p.parse_args()

    settings = get_settings()
    restaurants = {"r0": args.name}
    oriane = OrianeClient(settings)
    try:
        raw = await oriane.search_raw(restaurant_query(args.name, [], [args.platform], languages=["fr"]), limit=args.limit)
    finally:
        await oriane.aclose()
    sources = [s for s in (normalize(i) for i in extract_items(raw)) if s]

    extractor = Extractor(settings)
    sem = asyncio.Semaphore(settings.extraction_concurrency)

    async def one(s):
        async with sem:
            try:
                return s, await extractor.extract(s, restaurants), None
            except (ExtractionError, Exception) as exc:  # probe: report every failure kind
                return s, None, f"{type(exc).__name__}: {str(exc)[:200]}"

    results = await asyncio.gather(*(one(s) for s in sources))
    totals = {"attributed": 0, "products": 0, "prices": 0, "aspects": 0, "rejected": 0, "failed": 0}
    dump = []
    for s, ext, err in results:
        print(f"\n### {s.id} @{s.author_handle} views={s.metrics.views}")
        if err:
            totals["failed"] += 1
            print("  FAILED:", err)
            continue
        v = extract.validate(s, ext, restaurants)
        ev = {e.id: e for e in v.evidence}
        totals["attributed"] += bool(v.restaurant_ids)
        totals["products"] += len(v.products)
        totals["prices"] += sum(1 for p in v.products if p.price_amount)
        totals["aspects"] += len(v.aspects)
        totals["rejected"] += v.rejected_quotes
        print(f"  attributed: {sorted(v.restaurant_ids) or 'no'} | rejected quotes: {v.rejected_quotes}")
        for pr in v.products:
            q = ev[pr.evidence_ids[0]]
            print(f"  product: {pr.label} | price={pr.price_amount} {pr.currency or ''} | novelty={pr.novelty} | [{q.channel}] {q.quote[:80]!r}")
        for a in v.aspects:
            q = ev[a.evidence_ids[0]]
            print(f"  aspect: {a.aspect}/{a.polarity} by {a.speaker_type} ({a.experience_basis}) | [{q.channel}] {q.quote[:80]!r}")
        if v.hook_evidence_id:
            print(f"  hook: {ev[v.hook_evidence_id].quote[:80]!r}")
        dump.append({"source_id": s.id, "raw_extraction": ext.model_dump(mode="json"), "rejected": v.rejected_quotes})

    out = settings.cache_dir / "probe" / f"extract_{args.name.replace(' ', '_')}.json"
    out.write_text(json.dumps(dump, ensure_ascii=False, indent=1))
    print(f"\nTOTALS over {len(sources)} contents: {totals}\nRaw extractions saved to {out}")


if __name__ == "__main__":
    asyncio.run(main())
