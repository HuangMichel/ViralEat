"""Run ONE real Oriane search for a restaurant name and dump the raw response.

Usage: uv run python scripts/probe_oriane.py "Big Fernand" [--handle bigfernand] [--platform tiktok] [--limit 5]

Writes cache/probe/<timestamp>.json and prints a summary of what each content contains.
Costs one search request (re-runs with the same arguments hit the disk cache).
"""

import argparse
import asyncio
import json
from datetime import UTC, datetime

from viraleat_api.config import get_settings
from viraleat_api.oriane import OrianeClient, extract_items, normalize, restaurant_query


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("name", help="Restaurant name searched in caption, transcript and on-screen text")
    p.add_argument("--handle", action="append", default=[])
    p.add_argument("--platform", default="tiktok")
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--lang", action="append", default=None, help="Language filter (default: fr). --lang none disables it")
    args = p.parse_args()
    languages = [] if args.lang == ["none"] else (args.lang or ["fr"])

    settings = get_settings()
    client = OrianeClient(settings)
    try:
        body = restaurant_query(args.name, args.handle, [args.platform], languages=languages)
        # API CALL: Oriane, 1 content search (cached: re-running with the same arguments is free).
        raw = await client.search_raw(body, limit=args.limit)
    finally:
        await client.aclose()

    out = settings.cache_dir / "probe" / f"{datetime.now(UTC):%Y%m%dT%H%M%S}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(raw, ensure_ascii=False, indent=2))
    items = extract_items(raw)
    print(f"Raw response saved to {out}\n{len(items)} contents\n")
    for item in items:
        s = normalize(item)
        if s is None:
            print("- dropped (no platform id)")
            continue
        print(f"- {s.id} by @{s.author_handle} | {s.published_at:%Y-%m-%d} | views={s.metrics.views}"
              f" | transcript={'yes' if s.transcript else 'no'} | on-screen={'yes' if s.on_screen_text else 'no'}"
              f" | comments={len(s.comments)} | audio={'yes' if s.audio_id else 'no'} | location={s.location}")
        print(f"    caption: {(s.caption or '')[:120]!r}")
        if s.on_screen_text:
            print(f"    on-screen: {s.on_screen_text[:120]!r}")


if __name__ == "__main__":
    asyncio.run(main())
